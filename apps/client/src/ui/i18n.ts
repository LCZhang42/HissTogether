import type { Locale } from '@qiqihar/shared';

export const dictionary = {
  'zh-CN': {
    subtitle: '四只小猫，一声哈气。', sceneTitle: '四只猫 · 一声哈气', sceneSuccess: '齐齐哈尔!!', room: '房间', connecting: '连接中…', connected: '已连接', disconnected: '连接断开',
    copyLink: '复制房间链接', copied: '已复制！', randomMatch: '随机匹配', cancelMatch: '取消匹配', matchmaking: '匹配中', publicMatch: '公开匹配', foundPlayers: '已找到', secondsLeft: '秒', quickStart: '和机器人快速开始', waiting: '等待小猫加入', reconnecting: '猫位保留中',
    you: '你', bot: '机器人', hiss: '哈气！', meowBubble: '喵！', boopBubble: '碰！', achooBubble: '阿嚏！', achooWarning: '鼻子痒痒……等喷嚏结束再哈！', controls: '空格：哈气 · A/D：移动 · E：喵 · F：互动',
    touchControls: '触控操作', moveLeft: '向左', moveRight: '向右', meow: '喵', boop: '互动',
    language: 'English', statusReady: '按空格，和大家一起哈！', statusNeedPlayers: '邀请朋友、随机匹配，或和机器人开始', enterMatch: 'Enter：随机匹配', enterReplay: 'Enter：再来一局', enterContinue: 'Enter：立即再试',
    reduceMotion: '减少动态', fullMotion: '恢复动态', mute: '静音', unmute: '取消静音', replay: '再来一局', copyReport: '复制试玩报告', reportCopied: '报告已复制！', attempt: '尝试', attempts: '次数', best: '最佳重叠', bestRecord: '最佳纪录', failures: '失败', synchronized: '同步', time: '时间', latency: '延迟', clockOffset: '时钟差',
    success: '齐齐哈尔！！四只猫哈成了一团！', threeOfFour: '说好的齐齐哈尔呢？三只猫正在看它。',
    nearMiss: '差一点就成为传说。', chorus: '这是哈尔交响乐。', tooLate: '你是不是走路来的？',
    tooEarly: '你这只猫活在未来。', silence: '……喵？', timeout: '齐齐哈不了 · 但我们尽力了', sceneTimeout: '尽力了！',
  },
  en: {
    subtitle: 'Four tiny cats. One mighty hiss.', sceneTitle: 'FOUR CATS · ONE HISS', sceneSuccess: 'HISS TOGETHER!!', room: 'Room', connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected',
    copyLink: 'Copy room link', copied: 'Copied!', randomMatch: 'Quick Match', cancelMatch: 'Cancel match', matchmaking: 'Matching', publicMatch: 'Public match', foundPlayers: 'Found', secondsLeft: 's left', quickStart: 'Quick start with bots', waiting: 'Waiting for kittens', reconnecting: 'Holding kitten slot',
    you: 'YOU', bot: 'BOT', hiss: 'HISS!', meowBubble: 'MEOW!', boopBubble: 'BOOP!', achooBubble: 'ACHOO!', achooWarning: 'A nose is tickling… wait for the sneeze!', controls: 'Space: Hiss · A/D: Move · E: Meow · F: Boop',
    touchControls: 'Touch controls', moveLeft: 'Move left', moveRight: 'Move right', meow: 'Meow', boop: 'Boop',
    language: '简体中文', statusReady: 'Press Space and hiss together!', statusNeedPlayers: 'Invite friends, quick match, or start with bots', enterMatch: 'Enter: Quick Match', enterReplay: 'Enter: Play Again', enterContinue: 'Enter: Retry Now',
    reduceMotion: 'Reduce motion', fullMotion: 'Full motion', mute: 'Mute', unmute: 'Unmute', replay: 'Play again', copyReport: 'Copy playtest report', reportCopied: 'Report copied!', attempt: 'Attempt', attempts: 'Attempts', best: 'Best overlap', bestRecord: 'Best record', failures: 'Misses', synchronized: 'In sync', time: 'Time', latency: 'Latency', clockOffset: 'Clock offset',
    success: 'HISS TOGETHER!! Four cats, one magnificent noise!', threeOfFour: 'We said together. Three cats are staring.',
    nearMiss: 'One whisker away from legend.', chorus: 'The terrible hiss symphony.', tooLate: 'Did you walk here?',
    tooEarly: 'This kitten lives in the future.', silence: '…meow?', timeout: 'No perfect hiss · but we tried our tiny best', sceneTimeout: 'WE TRIED!',
  },
} as const;

export type TranslationKey = keyof (typeof dictionary)['zh-CN'];

export function getInitialLocale(): Locale {
  const saved = localStorage.getItem('qiqihar-locale');
  if (saved === 'zh-CN' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function setLocale(locale: Locale): void {
  localStorage.setItem('qiqihar-locale', locale);
  document.documentElement.lang = locale;
}

