'use strict';
const Service = require('egg').Service;
const idGenerateUtil = require("@jianghujs/jianghu/app/common/idGenerateUtil");
class AssignmentService extends Service {

  async fillInsertItemParamsBeforeHook() {
    const tableName = "assignment";
    const columnName = "assignmentId";
    const assignmentId = await idGenerateUtil.idPlus({
      knex: this.app.jianghuKnex,
      tableName,
      columnName,
    });
    Object.assign(this.ctx.request.body.appData.actionData, { assignmentId })
  }
}

module.exports = AssignmentService;
