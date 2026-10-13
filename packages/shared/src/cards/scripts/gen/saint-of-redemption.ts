import { registerScript } from '../registry'

// 'Ward / No minion is Evil, but all enter the realm tapped.'
registerScript('Saint of Redemption', {
  // 'No minion is Evil.' — FAQ: types are KEPT; Evil-ness is suppressed
  // globally via isEvilUnit()/isEvilCardName() in statics
  onUnitEnters: (ctx, entered) => {
    // "all enter the realm tapped" — FAQ (Oct 2026): this INCLUDES the Saint himself; Saint of
    // Redemption enters the realm tapped too (his own onUnitEnters fires for his own entry).
    if (!entered.isAvatar && !entered.tapped) entered.tapped = true
  },
})
