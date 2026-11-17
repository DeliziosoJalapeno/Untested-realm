import { createGame, applyAction, featuredDecks, type PlayerId, type DeckList } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { DECKS } from './decks'
import { getScript } from '../../packages/shared/src'
if (process.argv[4] === 'noability') for (const a of ['Lavamancer', 'Frost Mage']) for (const ab of (getScript(a) as any).abilities) ab.available = () => false
const key = process.argv[2], N = Number(process.argv[3] ?? 22), noAbility = process.argv[4] === 'noability'
const deck = DECKS[key] ?? (featuredDecks as DeckList[]).find((d) => d.name === key)!; const field = (featuredDecks as DeckList[]).filter((d) => !/FvL/.test(d.name))
let casts = 0, ends = 0, manaLeft = 0, w = 0, l = 0, acts = 0, traps = 0, games = 0, avatarDeaths = 0; const sitesAt: number[] = []; const msgs: Record<string, number> = {}
for (let i = 0; i < N; i++) {
  const opp = field[i % field.length]; const me = (i % 2) as PlayerId
  const g = createGame((me === 0 ? [deck, opp] : [opp, deck]) as any, ['A', 'B'], 777 + i, (Math.floor(i / 2) % 2) as PlayerId)
  let n = 0, recorded = false
  while (g.winner === null && g.phase !== 'over' && n++ < 6000 && g.turn <= 70) {
    const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
    let a: any = botAction(g, s)
    if (s === me && a.t === 'activate' && (a.ability === 'rift' || a.ability === 'encase')) acts++
    if (s === me && /trap/i.test(a.t)) traps++
    if (s === me && a.t === 'castSpell') casts++
    if (s === me && a.t === 'endTurn') { ends++; manaLeft += g.players[me].mana }
    if (!recorded && g.turn >= 12) { recorded = true; sitesAt.push(Object.values(g.sites).filter((x) => x.controller === me && !x.isRubble).length) }
    if (!applyAction(g, s, a).ok) break
  }
  games++; if (g.winner === me) w++; else if (g.winner !== null) l++
}
console.log(JSON.stringify({ key, noAbility, w, l, abilityUsesPerGame: +(acts / games).toFixed(1), trapsPerGame: +(traps / games).toFixed(1), castsPerTurn: +(casts / ends).toFixed(2), manaUnspentPerTurn: +(manaLeft / ends).toFixed(2), turns: Math.round(ends / games), sitesAtTurn12: +(sitesAt.reduce((a, b) => a + b, 0) / sitesAt.length).toFixed(1) }))
