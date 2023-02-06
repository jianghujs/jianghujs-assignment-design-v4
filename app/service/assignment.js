const Service = require("egg").Service;

const dayjs = require("dayjs");
const _ = require("lodash");
const { tableEnum } = require("../constant/constant");
const validateUtil = require("@jianghujs/jianghu/app/common/validateUtil");
const idGenerateUtil = require("@jianghujs/jianghu/app/common/idGenerateUtil");
// ========================================常用 require end=============================================
const { BizError, errorInfoEnum } = require("../constant/error");
const actionDataScheme = Object.freeze({
  selectArticleAssignmentList: {
    type: "object",
    additionalProperties: true,
    required: [],
    properties: {
      articleId: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
  },
});

class AssignmentService extends Service {

  async appendAssignIdToActionData () {
    const { actionData, actionId } = this.ctx.request.body.appData;
    const {articleId} = actionData;
    const { userId } = this.ctx.userInfo;
    if (actionId === 'insertItem') {
      // 新增作业插入答案body
      const article = await this.app.jianghuKnex(tableEnum.article).where({ articleId }).select("articleAssignmentWithAnswer").first();
      this.ctx.request.body.appData.actionData.assignmentFormItemListWithAnswer = JSON.stringify(JSON.parse(article.articleAssignmentWithAnswer))
    }
    this.ctx.request.body.appData.actionData.assignmentId = `${articleId}_${userId}_` + _.random(100000, 999999);
    this.ctx.request.body.appData.actionData.userId = userId;
  }

  async appendAssignmentReviewAt() {
    const { userId } = this.ctx.userInfo;
    this.ctx.request.body.appData.actionData.assignmentReviewAt = dayjs().format();
    this.ctx.request.body.appData.actionData.assignmentReviewUserId = userId;

  }
  async selectTeacherAssignment() {
    const { userId } = this.ctx.userInfo;
    const { jianghuKnex } = this.app;
    const {assignmentReviewStatus, assignmentSubmitStatus} = this.ctx.request.body.appData.actionData;
    const groupIdData = await jianghuKnex(tableEnum.baofeng_user_group_role).where({userId, roleId: 'teacher'}).select();
    const groupIdList = groupIdData.map(e => {
      return e.groupId;
    });
    
    const albumGroupData = await jianghuKnex(tableEnum.baofeng_group_album).where('groupId', 'in', groupIdList).select();
    const albumIdList = albumGroupData.map(e => {
      return e.albumId;
    })
    
    const albumArticleData =await jianghuKnex(tableEnum.album_article).where('albumId', 'in', albumIdList).select();
    const articleIdList = albumArticleData.map(e => {
      return e.articleId;
    })
    let assignment = await jianghuKnex(tableEnum.view01_assignment)
    .where('articleId', 'in', articleIdList)
    .andWhere('baofengGroupId', 'in', groupIdList)
    .select();
    assignment = assignment.filter(e => (assignmentReviewStatus.length ? assignmentReviewStatus.includes(e.assignmentReviewStatus) : true) && (assignmentSubmitStatus.length ? assignmentSubmitStatus.includes(e.assignmentSubmitStatus) : true))
    return {rows: assignment};
  }

  async cancelSubmit() {
    const {id} = this.ctx.request.body.appData.actionData;
    const { jianghuKnex } = this.app;
    const assignment = await jianghuKnex(tableEnum.assignment).where({id}).first();
    let { assignmentFormItemListWithUser, assignmentFormItemListWithAnswer } = assignment;
    assignmentFormItemListWithUser = JSON.parse(assignmentFormItemListWithUser);
    assignmentFormItemListWithAnswer = JSON.parse(assignmentFormItemListWithAnswer);
    assignmentFormItemListWithUser.forEach(e => {
      e.reviewData = {};
    })
    assignmentFormItemListWithAnswer.forEach(e => {
      e.reviewData = {};
    })
    
    assignmentFormItemListWithUser = JSON.stringify(assignmentFormItemListWithUser);
    assignmentFormItemListWithAnswer = JSON.stringify(assignmentFormItemListWithAnswer);
    
    return await jianghuKnex(tableEnum.assignment).where({id}).update({assignmentFormItemListWithUser, assignmentFormItemListWithAnswer, assignmentSubmitStatus: '', assignmentReviewStatus: ''});
  }
  
  async selectArticleAssignmentList() {
    const { actionData } = this.ctx.request.body.appData;
    const { jianghuKnex } = this.app;
    const { userInfo } = this.ctx;
    const { userId } = userInfo;

    // validateUtil.validate(actionDataScheme.selectArticleAssignment, actionData);
    const { articleId } = actionData;
    const article = await jianghuKnex(tableEnum.article).where({ articleId })
      .select("articleAssignmentWithAnswer")
      .select("articleAssignment")
      .first();
    if (!article) {
      throw new BizError(errorInfoEnum.article_not_found)
    }
    let articleAssignment = [];
    let articleAssignmentAnswer = [];
    try {
      articleAssignment = JSON.parse(article.articleAssignment || '[]');
      articleAssignmentAnswer = JSON.parse(article.articleAssignmentWithAnswer || '[]');
    } catch (error) {
      this.app.logger.error('[assignment.js]', 'JSON.parse error', error)
    }

    const userAssignment = await jianghuKnex(tableEnum.assignment).where({ articleId, userId }).first();
    // const userAssignmentMap = Object.fromEntries(
    //   userAssignmentList.map(obj => [obj.assignmentVersion, obj])
    // );

    for (const it of articleAssignment) {
      const cache = articleAssignmentAnswer.find(e => e.id === it.id);

      it.check = {
        grade: it.hasOwnProperty('check') ? it.check.grade : '',
        remark: it.hasOwnProperty('check') ? it.check.remark : '',
        answer: this.getAnswerData(cache.component.title, cache.answerData),
        isRight: this.checkAnswer(it.component.title, it.answerData, cache.answerData)
      }
    }
    return { rows: articleAssignment };
  }

  async selectAssignmentListInfo() {
    const { actionData } = this.ctx.request.body.appData;
    const { jianghuKnex } = this.app;
    const { userInfo } = this.ctx;
    const { userId } = userInfo;
    validateUtil.validate(actionDataScheme.selectarticleAssignment, actionData);
    const { articleId } = actionData;
    const article = await jianghuKnex(tableEnum.article).where({ articleId: articleId }).select("articleTitle").select("articleAssignmentWithAnswer").first();
    if (!article) {
      throw new BizError(errorInfoEnum.article_not_found)
    }

    let articleAssignment = [];
    try {
      articleAssignment = JSON.parse(article.articleAssignmentWithAnswer || '[]');
    } catch (error) {
      this.app.logger.error('[assignment.js]', 'JSON.parse error', error)
    }
    const userAssignmentList = await jianghuKnex(tableEnum.assignment).where({ articleId }).select();
    const answerTable = await this.getFormItemTable(articleAssignment);
    for (const item of userAssignmentList) {
      const fromItemList = JSON.parse(item.assignmentFormItemList);
      item.answerTable = []
      for (const it of fromItemList) {
        item.answerTable.push({
          type: it.component.title,
          title: it.component.outline,
          answerData: this.getAnswerData(it.component.title, it.answerData),
        })
      }
      console.log(item.answerTable)
    }
    return { rows: userAssignmentList, answerTable };
  }
  async getFormItemTable(data) {
    const res = {}
    for (const item of data) {
      res[item.version] = res[item.version] || [];
      for (const it of item.formItemList) {
        res[item.version].push({
          type: it.component.title,
          title: it.component.outline,
          list: it.component.property.selectOptionList || '',
          answerData: await this.getAnswerData(it.component.title, it.answerData),
        })
      }
    }
    return res;
  }
  getAnswerData(type, data) {
    console.log('type', type)
    console.log('data', data)
    switch (type.replace(' ', '')) {
      case "单选":
        return data.selected;
      case "多选":
        return Object.keys(data).join(',');
      case "问答":
        return data.answer;
      default :
        return 'default';
    }
  }
  checkAnswer(type, old, now) {
    switch (type) {
      case "单选":
        return old.selected === now.selected;
      case "多选":
        return Object.keys(old).join(',') === Object.keys(now).join(',');
      case "问答":
        return old.answer === now.answer;
      default :
        return false;
    }
  }
}
module.exports = AssignmentService;
