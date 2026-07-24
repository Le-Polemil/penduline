// Service worker MV3. Point d'entrée minimal — accueillera plus tard :
//  - la synchro / rafraîchissement de session Supabase
//  - la programmation des rappels (chrome.alarms → notifications)
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Penduline] extension installée');
});
