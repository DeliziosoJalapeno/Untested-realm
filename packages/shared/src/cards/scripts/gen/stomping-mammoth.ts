import { registerScript } from '../registry'

// "While attacking, the Mammoth's excess damage is dealt to its site."
// Its site is the one it stands at — its controller's own included (FAQ: "When elephants fight, it is the
// grass that suffers!"). The fight itself applies it (combat.ts, attackExcessToItsSite).
registerScript('Stomping Mammoth', { attackExcessToItsSite: true })
