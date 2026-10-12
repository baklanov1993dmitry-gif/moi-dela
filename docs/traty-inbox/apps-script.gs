// «Траты»: забирает письма с чеками из Gmail и кладёт в Supabase. Бесплатно, без ИИ.
// Вставить в script.google.com (проект под тем Gmail, куда приходят чеки), указать СЕКРЕТ, запустить setup() один раз.
const SECRET = 'ВСТАВЬ_СЕКРЕТ';   // тот же, что в SQL
const SB_URL = 'https://rjiuialimbrnbriqafjl.supabase.co';
const SB_KEY = 'sb_publishable_Hf5J8zcRXPKBVugh68TyAw_ZXQ6leQX';

function pushReceipts() {
  const done = GmailApp.getUserLabelByName('traty-done') || GmailApp.createLabel('traty-done');
  GmailApp.search('label:Чеки -label:traty-done newer_than:14d', 0, 30).forEach(th => {
    let ok = true;
    th.getMessages().forEach(m => {
      try {
        const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/rpc/fin_inbox_push', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { apikey: SB_KEY },
          payload: JSON.stringify({
            p_secret: SECRET, p_msgid: m.getId(), p_subject: m.getSubject(), p_sender: m.getFrom(),
            p_received: m.getDate().toISOString(), p_plain: m.getPlainBody() || '', p_html: m.getBody() || ''
          })
        });
        if (r.getResponseCode() >= 300) { ok = false; console.error(r.getResponseCode() + ' ' + r.getContentText()); }
      } catch (e) { ok = false; console.error(e); }
    });
    if (ok) th.addLabel(done);
  });
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pushReceipts').timeBased().everyMinutes(5).create();
  pushReceipts();
}
