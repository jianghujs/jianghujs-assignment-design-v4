'use strict';
const Service = require('egg').Service;
const { tableEnum, articlePublishStatusEnum } = require("../constant/constant");
const _ = require("lodash");
const path = require("path");

// TODO: 封装一下
const dayjs = require("dayjs");
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone') // dependent on utc plugin
dayjs.extend(utc)
dayjs.extend(timezone)

const idGenerateUtil = require("@jianghujs/jianghu/app/common/idGenerateUtil");
const validateUtil = require("@jianghujs/jianghu/app/common/validateUtil");
const { BizError, errorInfoEnum } = require("../constant/error");
const fs = require("fs"),
    fsPromises = require("fs").promises,
    unlink = fsPromises.unlink,
    rename = fsPromises.rename,
    util = require("util"),
    exists = util.promisify(fs.exists);
const actionDataScheme = Object.freeze({
  deletedArticle: {
    type: "object",
    additionalProperties: true,
    required: ["articleId"],
    properties: {
      articleId: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
  },
  restoreArticle: {
    type: "object",
    additionalProperties: true,
    required: ["articleId"],
    properties: {
      articleId: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
  },
});

class ArticleService extends Service {

  async fillInsertItemParamsBeforeHook() {
    const { userId, username } = this.ctx.userInfo;
    const time = dayjs().format();
    const tableName = "article";
    const columnName = "articleId";
    const articleId = await idGenerateUtil.idPlus({
      knex: this.app.jianghuKnex,
      tableName,
      columnName,
    });
    Object.assign(this.ctx.request.body.appData.actionData, { articleId })
  }

  async deletedArticle() {
    const { jianghuKnex } = this.app;
    const actionData = this.ctx.request.body.appData.actionData;
    validateUtil.validate(actionDataScheme.deletedArticle, actionData);
    const { articleId } = actionData;
    const { articleMaterialDir } = this.app.config;

    await jianghuKnex(tableEnum.article, this.ctx).where({ articleId }).update({ articlePublishStatus: articlePublishStatusEnum.deleted });

    // const articleDirPath = path.join(articleMaterialDir, `${articleId}`);
    // const articleRecycleDirPath = path.join(articleMaterialDir, '_recycle', `${articleId}`);
    // if (!await exists(articleDirPath)) {
    //     return;
    // }
    // if (await exists(articleRecycleDirPath)) {
    //   await unlink(articleRecycleDirPath);
    // }
    // await rename(articleDirPath, articleRecycleDirPath)
  }

  async restoreArticle() {
    const { jianghuKnex } = this.app;
    const actionData = this.ctx.request.body.appData.actionData;
    validateUtil.validate(actionDataScheme.restoreArticle, actionData);
    const { articleId } = actionData;
    const { articleMaterialDir } = this.app.config;

    await jianghuKnex(tableEnum.article, this.ctx).where({ articleId }).update({ articlePublishStatus: articlePublishStatusEnum.login });

    const articleDirPath = path.join(articleMaterialDir, `${articleId}`);
    const articleRecycleDirPath = path.join(articleMaterialDir, '_recycle', `${articleId}`);
    if (!await exists(articleRecycleDirPath) || await exists(articleDirPath)) {
        return;
    }
    await rename(articleRecycleDirPath, articleDirPath);
  }

  async getArticleAndFillArticles() {
    const { ctx, app } = this;
    const { jianghuKnex } = app;
    const articleId = ctx.pathParams && ctx.pathParams[0]
      || this.ctx.request.body.appData.actionData.articleId;
    const article = await jianghuKnex(tableEnum.article)
      .where({ articleId })
      .first();
    if (!article) {
      throw new BizError(errorInfoEnum.article_not_found)
    }

    const { categoryId } = article;
    let articlelist = await jianghuKnex(tableEnum.view01_article)
      .where({
        categoryId,
      })
      .select();
    articlelist = articlelist.map(
      ({
        articleId,
        articleTitle,
        categoryId,
        categoryName,
        articleCoverImage,
        articlePublishStatus,
        articleGroupName,
      }) => {
        return {
          articleId,
          articleTitle,
          categoryId,
          categoryName,
          articleCoverImage,
          articlePublishStatus,
          articleGroupName,
        };
      }
    );
    const groupNameArticlelist = articlelist.filter(({ articleGroupName }) => !!articleGroupName);
    const noGroupNameArticlelist = articlelist.filter(
      ({ articleGroupName }) => !articleGroupName
    );
    const groupByArticleMap = _.groupBy(groupNameArticlelist, "articleGroupName");
    const hasGroupNameArticlelist = Object.values(groupByArticleMap).map(list => {
      const { articleGroupName } = list[0];
      return {
        articleTitle: articleGroupName,
        isGroup: true,
        childrenList: list,
      };
    });
    let newArticleList = hasGroupNameArticlelist.concat(noGroupNameArticlelist);
    newArticleList = _.orderBy(
      newArticleList,
      ["articleTitle"],
      ["asc"]
    );
    article.articleList = newArticleList;
    return article;
  }

}

module.exports = ArticleService;
