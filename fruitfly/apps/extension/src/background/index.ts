import { InternalMsgSchema } from '../shared/messages';
import { updateSettings } from '../shared/settings';
import { AgentHost } from './host';

const host = new AgentHost();

chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason === 'install') { await updateSettings((s) => ({ ...s, firstUseAt: Date.now() })); await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') }); }
  chrome.contextMenus.removeAll(() => { chrome.contextMenus.create({ id: 'ff-add-page', title: 'Add this page to FruitFly Pantry', contexts: ['page'] }); chrome.contextMenus.create({ id: 'ff-open', title: 'Open FruitFly', contexts: ['page', 'selection'] }); });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ff-add-page' && tab?.id) void host.internal({ ff: 'add_page_to_pantry', tabId: tab.id }, { tab } as chrome.runtime.MessageSender);
  if (info.menuItemId === 'ff-open' && tab?.windowId) void chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.commands?.onCommand.addListener((cmd, tab) => { if (cmd === 'open-panel' && tab?.windowId) void chrome.sidePanel.open({ windowId: tab.windowId }); });
chrome.alarms.onAlarm.addListener(() => { /* waking the worker is the point: keeps a running task alive */ void host.ready; });

chrome.runtime.onConnect.addListener((port) => { if (port.name !== 'panel') return; void host.ready.then(() => host.hello(port)); });

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const p = InternalMsgSchema.safeParse(raw);
  if (!p.success) return false;
  // content scripts (anything not served from this extension) may only send their own narrow messages
  const fromExtension = sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
  if (!fromExtension && !['takeover_from_page', 'stop_from_page', 'fly_path'].includes(p.data.ff)) return false;
  if (p.data.ff === 'open_panel') { const w = sender.tab?.windowId; void (w ? chrome.sidePanel.open({ windowId: w }) : chrome.windows.getCurrent().then((cw) => chrome.sidePanel.open({ windowId: cw.id! }))).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true; }
  void host.internal(p.data, sender).then(sendResponse).catch((e: Error) => sendResponse({ ok: false, error: e.message }));
  return true;
});

chrome.tabs.onRemoved.addListener((id) => host.browser.forgetTab(id));
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'loading') host.browser.forgetTab(id); });
