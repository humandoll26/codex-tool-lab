import * as venue from '../modules/venue/model.js';
import * as rights from '../modules/rights/model.js';
import * as show_day from '../modules/show-day/model.js';
import * as front_desk from '../modules/front-desk/model.js';
import * as settlement from '../modules/settlement/model.js';
import * as program from '../modules/program/model.js';
import * as stage_operations from '../modules/stage-operations/model.js';
import * as flyer from '../modules/flyer/model.js';
import * as distribution from '../modules/distribution/model.js';
import * as publicity from '../modules/publicity/model.js';
import * as tickets from '../modules/tickets/model.js';
import * as rehearsal from '../modules/rehearsal/model.js';
import * as submissions from '../modules/submissions/model.js';
export const DEFINITIONS = {
  budget: { name: '予算・料金', description: '想定販売と収支を試算する' },
  flyer: { ...flyer, name: 'チラシ', description: '掲載情報・原稿・校正をまとめる' },
  distribution: { ...distribution, name: '配布', description: '配布先・部数・残部を管理する' },
  publicity: { ...publicity, name: 'SNS・広報', description: '投稿原稿と公開予定を管理する' },
  tickets: { ...tickets, name: '販売進捗', description: '実績枚数と残席を確認する' },
  rehearsal: { ...rehearsal, name: '稽古', description: '日時・参加役割・連絡事項をまとめる' },
  submissions: { ...submissions, name: '提出物', description: '提出期限・差戻し・提出日を管理する' },
  'front-desk': { ...front_desk, name: '受付準備', description: '受付準備の作業と記録を整理する' },
  'settlement': { ...settlement, name: '決算', description: '決算の作業と記録を整理する' },
  'program': { ...program, name: 'パンフ', description: 'パンフの作業と記録を整理する' },
  'stage-operations': { ...stage_operations, name: '舞台進行', description: '舞台進行の作業と記録を整理する' },
  'venue': { ...venue, name: '劇場・日程', description: '劇場・日程の作業と記録を整理する' },
  'rights': { ...rights, name: '作品・権利', description: '作品・権利の作業と記録を整理する' },
  'show-day': { ...show_day, name: '当日運営', description: '当日運営の作業と記録を整理する' }
};
export function validateModules(project) {
  const issues = [];
  for (const [id, def] of Object.entries(DEFINITIONS)) {
    const data = project.modules?.[id]?.data;
    if (data?.version === 1 && def.validate) issues.push(...def.validate(data, `project.modules.${id}.data`, project));
  }
  return issues;
}
