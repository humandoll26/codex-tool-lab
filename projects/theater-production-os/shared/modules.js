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
  submissions: { ...submissions, name: '提出物', description: '提出期限・差戻し・提出日を管理する' }
};
export function validateModules(project) {
  const issues = [];
  for (const [id, def] of Object.entries(DEFINITIONS)) {
    const data = project.modules?.[id]?.data;
    if (data?.version === 1 && def.validate) issues.push(...def.validate(data, `project.modules.${id}.data`, project));
  }
  return issues;
}
