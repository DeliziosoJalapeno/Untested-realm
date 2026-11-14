// The tutorial curriculum. Each lesson is a small prepared board plus a list of steps: the coach
// explains one rule, then asks you to do it for real on the live engine. `solve` is the scripted
// answer the lesson test plays to prove every lesson can be completed.
import { PRECONS, createGame, type Action, type PlayerId, type Region } from '@sorcery/shared'
import { botAction } from '../bot'
import { scene, unit, alive, inHand, siteOn, unitNamed, life, type Tut, type Scene } from './scene'
import type { Lesson, TStep } from './runner'

// ---------- shorthand ----------
const at = (x: number, y: number, region: Region = 'surface') => ({ x, y, region })
const sq = (x: number, y: number) => `[data-sq="${x},${y}"]`
const U = (t: Tut, key: string) => `[data-unit="${t.ids[key]}"]`
const H = (name: string) => `[data-hand][data-card="${name}"]`
const END = 'button.railturn'
const mine = (t: Tut) => (t.g.prompts[0]?.player === 0 ? t.g.prompts[0] : null)
const answer = (t: Tut, choice: any): Action => ({ t: 'prompt', promptId: t.g.prompts[0].id, choice })
const myTurn = (t: Tut, fromTurn: number) => t.g.turn >= fromTurn && t.g.activePlayer === 0
const inMain = (t: Tut, fromTurn: number) => myTurn(t, fromTurn) && t.g.phase === 'main' && !t.g.prompts.length
const mySites = (t: Tut) => Object.values(t.g.sites).filter((s) => s.controller === 0).length
const cast = (t: Tut, name: string, extra: Partial<Extract<Action, { t: 'castSpell' }>> = {}): Action =>
  ({ t: 'castSpell', cardId: inHand(t, name)!, casterId: t.ids.me, ...extra })
const move = (t: Tut, key: string, to: { x: number; y: number; region: Region }, attack?: { unit: string } | { site: string }): Action =>
  ({ t: 'moveAttack', unitId: t.ids[key], path: [to], ...(attack ? { attack } : {}) })
const isCast = (a: Action, t: Tut, name: string) => a.t === 'castSpell' && t.g.cards[a.cardId]?.name === name
const isMove = (a: Action, t: Tut, key: string) => a.t === 'moveAttack' && a.unitId === t.ids[key]

// the three steps every multi-turn lesson repeats
const endTurn = (say: string, fromTurn = 3, foe?: TStep['foe']): TStep => ({
  say, task: 'End your turn: press End turn (and confirm if the game asks).', spot: () => [END],
  ok: (a) => a.t === 'endTurn', nope: 'Nothing more to do this turn — press End turn.',
  done: (t) => myTurn(t, fromTurn), foe,
  solve: (t) => (t.g.activePlayer === 0 && !mine(t) ? { t: 'endTurn' } : null),
})
const drawStep = (say: string, deck: 'spellbook' | 'atlas' = 'spellbook', fromTurn = 3): TStep => ({
  say, task: `Draw a card (choose your ${deck}).`,
  ok: () => false, nope: 'Answer the draw question first.',
  done: (t) => inMain(t, fromTurn),
  solve: (t) => (mine(t) ? answer(t, deck) : null),
})

// the standard small realm: you hold the two bottom rows, the coach the two top rows
const HOME: Scene['sites'] = [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [0, 'Wasteland', 1, 1], [0, 'Stream', 3, 1]]
const AWAY: Scene['sites'] = [[1, 'Wasteland', 2, 3], [1, 'Wasteland', 2, 2], [1, 'Valley', 1, 2], [1, 'Valley', 3, 2]]

const C1 = '1 · First steps', C2 = '2 · On the defensive', C3 = '3 · Keywords and regions', C4 = '4 · Spells', C5 = '5 · New rules', C6 = '6 · Graduation'

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ 1
  {
    id: 'realm', chapter: C1, title: 'The realm and your first sites',
    blurb: 'The board, your Avatar, the void, and how sites are played.',
    covers: ['Realm', 'Avatar', 'Sites', 'Void', 'Turn structure', 'Drawing'],
    build: () => scene({ sites: [[0, 'Valley', 2, 0], [1, 'Wasteland', 2, 3]], hand: ['Spire'], topSites: ['Stream', 'Wasteland'] }),
    steps: [
      { say: `Welcome to Sorcery. I'm your coach — I'll explain one rule at a time and then ask you to do it yourself.\n\nThis is the **realm**: a grid five squares wide and four deep. You sit at the bottom, I sit at the top. Each of us has an **Avatar** — that card is you. Yours stands in the middle of your back row.`, spot: (t) => [U(t, 'me'), U(t, 'foe')] },
      { say: `An empty square is **void**. Almost nothing can stand there, so the realm has to be built one **site** at a time.\n\nSites do two jobs: each one you control gives you **1 mana** every turn, and sites are the ground your minions stand on.` },
      {
        say: `Your Avatar has one ability of its own: **Tap → play or draw a site.** Tapping turns a card sideways; a tapped card has done its work for the turn.\n\nA new site must be placed **adjacent** to one you already control — sharing an edge, not a corner.`,
        task: 'Play the Spire from your hand onto a square next to your Valley.',
        spot: () => [H('Spire'), sq(2, 1), sq(1, 0), sq(3, 0)],
        ok: (a) => a.t === 'avatarSite' && a.mode === 'play', nope: 'Click the Spire in your hand, then one of the highlighted squares.',
        done: (t) => mySites(t) >= 2,
        solve: (t) => ({ t: 'avatarSite', mode: 'play', cardId: inHand(t, 'Spire')!, x: 2, y: 1 }),
      },
      { say: `Your Avatar is now tapped, and your mana went up straight away: a site gives its mana the moment it arrives.\n\nIf you have no site in hand, the same tap **draws** one from your atlas instead. Either way, one site action per turn is the rhythm of the early game.` },
      endTurn(`A turn has three phases. **Start:** your cards untap and you draw. **Main:** you act, in any order, as much as your mana and untapped cards allow. **End:** damage on minions is healed.\n\nYou've done all you can, so pass the turn to me. I'll pass straight back.`),
      drawStep(`At the start of every turn you draw **one** card, and you choose where from: your **spellbook** (minions, magic, artifacts, auras) or your **atlas** (sites).\n\nChoosing well is a real skill: too few sites and you can't afford your spells, too many and you have nothing to cast. Right now you need ground, so take a site.`, 'atlas'),
      {
        say: `Your Avatar untapped at the start of the turn, so it can work again.`,
        task: 'Play the site you just drew.',
        spot: () => ['[data-hand]'],
        ok: (a) => a.t === 'avatarSite' && a.mode === 'play', nope: 'Click the site in your hand, then a highlighted square.',
        done: (t) => mySites(t) >= 3,
        solve: (t) => ({ t: 'avatarSite', mode: 'play', cardId: t.g.players[0].hand[0], x: 1, y: 0 }),
      },
      { say: `Three sites, three mana every turn from now on.\n\nOne more thing about placement: sites can be attacked (you'll see how soon), and a destroyed site leaves **Rubble** behind — ground that gives no mana. Where you build matters.` },
    ],
    outro: `You know the board, the turn, and how to build the realm. Next: spending that mana.`,
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'mana', chapter: C1, title: 'Mana, threshold and minions',
    blurb: 'What a card costs, what threshold means, and summoning your first minions.',
    covers: ['Mana', 'Elemental threshold', 'Casting minions', 'Summoning sickness'],
    build: () => scene({ sites: [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [1, 'Wasteland', 2, 3]], hand: ['Snow Leopard', 'Foot Soldiers', 'Hellhounds', 'Wasteland'] }),
    steps: [
      { say: `Every spell has a **mana cost** — the number in its top corner. You have 2 sites, so you have 2 mana this turn. Mana you don't spend is gone at the end of the turn; you get a fresh supply next turn.` },
      { say: `Most spells also need **threshold**: the element symbols on the card. There are four elements — **Air**, **Earth**, **Fire** and **Water** — and each site provides one or more.\n\nThreshold is never spent. It is a requirement: to cast a card showing one Air symbol you must control at least one Air source. Your Valley gives Earth; your Spire gives Air.` },
      {
        say: `**Snow Leopard** costs 1 and needs one Air. You have both.\n\nYour Avatar is a **Spellcaster**, so it does the casting. A minion you cast is **summoned** onto any site you control.`,
        task: 'Cast Snow Leopard: click it in your hand, then click one of your sites.',
        spot: () => [H('Snow Leopard'), sq(2, 0), sq(2, 1)],
        ok: (a, t) => isCast(a, t, 'Snow Leopard'), nope: 'Start with the Snow Leopard.',
        done: (t) => !!unitNamed(t, 'Snow Leopard'),
        solve: (t) => cast(t, 'Snow Leopard', { at: { x: 2, y: 1 } }),
      },
      {
        say: `One mana left. **Foot Soldiers** cost 1 and have no threshold at all, so anyone can cast them.`,
        task: 'Cast Foot Soldiers.',
        spot: () => [H('Foot Soldiers')],
        ok: (a, t) => isCast(a, t, 'Foot Soldiers'), nope: 'Cast the Foot Soldiers.',
        done: (t) => !!unitNamed(t, 'Foot Soldiers'),
        solve: (t) => cast(t, 'Foot Soldiers', { at: { x: 2, y: 0 } }),
      },
      {
        say: `**Hellhounds** cost 3 and need **Fire**. You have neither the mana nor the threshold — the most common mistake in Sorcery is casting something without checking threshold.\n\nThe Wasteland in your hand fixes both: it's a third site, and it provides Fire.`,
        task: 'Play the Wasteland with your Avatar.',
        spot: () => [H('Wasteland')],
        ok: (a) => a.t === 'avatarSite' && a.mode === 'play', nope: 'Play the Wasteland: click it, then a highlighted square.',
        done: (t) => mySites(t) >= 3,
        solve: (t) => ({ t: 'avatarSite', mode: 'play', cardId: inHand(t, 'Wasteland')!, x: 1, y: 1 }),
      },
      { say: `The new site gave you 1 mana at once, but Hellhounds need 3. They'll have to wait a turn.\n\nYour two new minions can't act yet either. A minion that entered the realm this turn has **summoning sickness**: it can't tap, so it can't move or attack until your next turn. It *can* still defend on my turn.` },
      endTurn(`Pass the turn. Everything of yours untaps when your next turn starts.`),
      drawStep(`Choose either deck — you have what you need for now.`),
      {
        say: `Three sites: 3 mana, with Earth, Air and Fire threshold.`,
        task: 'Cast Hellhounds.',
        spot: () => [H('Hellhounds')],
        ok: (a, t) => isCast(a, t, 'Hellhounds'), nope: 'Cast the Hellhounds.',
        done: (t) => !!unitNamed(t, 'Hellhounds'),
        solve: (t) => cast(t, 'Hellhounds', { at: { x: 2, y: 1 } }),
      },
    ],
    outro: `That's the engine of the game: sites give mana and threshold, mana and threshold turn into minions. Next: making them fight.`,
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'move', chapter: C1, title: 'Move and attack',
    blurb: 'Steps, attacks, how a fight resolves, and when damage heals.',
    covers: ['Move and Attack', 'Strike', 'Power', 'Damage', 'Tapping'],
    build: () => scene({
      sites: [...HOME, ...AWAY],
      units: [
        { key: 'sol', p: 0, name: 'Foot Soldiers', x: 3, y: 1 }, { key: 'war', p: 0, name: 'Amazon Warriors', x: 2, y: 1 }, { key: 'dog', p: 0, name: 'Hellhounds', x: 1, y: 1 },
        { key: 'cam', p: 1, name: 'Raal Dromedary', x: 2, y: 2 }, { key: 'tro', p: 1, name: 'Cave Trolls', x: 1, y: 2 },
      ],
    }),
    steps: [
      { say: `Every unit — minions and Avatars alike — has the basic ability **Move and Attack**:\n\n**Tap → take one step. Then it may attack.**\n\nA step goes to an adjacent square (never diagonally), and only onto a site: the void is not ground.` },
      {
        say: `Start with a plain move.`,
        task: 'Move your Foot Soldiers one step: click them, then click a highlighted square. (If the game offers an attack, choose Move only.)',
        spot: (t) => [U(t, 'sol')],
        ok: (a, t) => isMove(a, t, 'sol') && !(a as any).attack, nope: 'Just move the Foot Soldiers for now — no attack.',
        done: (t) => { const u = unit(t, 'sol'); return !!u && (u.x !== 3 || u.y !== 1) },
        solve: (t) => move(t, 'sol', at(2, 1)),
      },
      { say: `The Foot Soldiers are tapped: they've used their Move and Attack for this turn.\n\nNow a fight. A unit may attack an enemy unit at the location where it ends its step. Both sides then **strike** each other **at the same time**, each dealing damage equal to its **power** — the number on the card. A minion dies when the damage on it reaches its power.` },
      {
        say: `Your **Amazon Warriors** have 5 power. My **Raal Dromedary** in front of them has 2.`,
        task: 'Attack the Raal Dromedary with your Amazon Warriors: click the Warriors, click the Dromedary\'s square, then choose ⚔ Attack Raal Dromedary.',
        spot: (t) => [U(t, 'war'), U(t, 'cam')],
        ok: (a, t) => isMove(a, t, 'war') && (a as any).attack?.unit === t.ids.cam, nope: 'Use the Amazon Warriors, and attack the Raal Dromedary.',
        done: (t) => !alive(t, 'cam'),
        solve: (t) => move(t, 'war', at(2, 2), { unit: t.ids.cam }),
      },
      { say: `The Dromedary took 5 damage — more than its 2 power — and went to my **cemetery**. Your Warriors took 2 and survived.\n\nThat damage doesn't last: **all damage on minions is healed at the end of every turn.** To kill a minion you have to deal its full power in a single turn.` },
      {
        say: `Now an even fight. Your **Hellhounds** have 3 power; so do my **Cave Trolls**.`,
        task: 'Attack the Cave Trolls with your Hellhounds.',
        spot: (t) => [U(t, 'dog'), U(t, 'tro')],
        ok: (a, t) => isMove(a, t, 'dog') && (a as any).attack?.unit === t.ids.tro, nope: 'Attack the Cave Trolls with the Hellhounds.',
        done: (t) => !alive(t, 'tro'),
        solve: (t) => move(t, 'dog', at(1, 2), { unit: t.ids.tro }),
      },
      { say: `Both died: strikes are simultaneous, so equal minions trade.\n\nNotice I didn't react to any of this. On your turn I normally could — untapped units can **defend**. That's the next chapter. First, how the game is actually won.` },
    ],
    outro: `You can move, attack and read a fight. Next: sites, life and the winning blow.`,
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'win', chapter: C1, title: "Life, Death's Door and winning",
    blurb: 'Attacking sites, losing life, and the death blow that ends the game.',
    covers: ['Life', 'Attacking sites', "Death's Door", 'Death blow'],
    build: () => scene({
      sites: [...HOME, ...AWAY], life: [20, 3],
      units: [{ key: 'dog', p: 0, name: 'Hellhounds', x: 1, y: 1 }, { key: 'war', p: 0, name: 'Amazon Warriors', x: 2, y: 2 }],
    }),
    steps: [
      { say: `Each Avatar starts with **20 life**. Mine is down to **3** — let's finish this.\n\nThere are two ways to take life from me: strike my **Avatar**, or attack one of my **sites**. A site that is attacked doesn't fight back; instead its controller loses life equal to the attacker's power.`, spot: (t) => [U(t, 'foe')] },
      {
        say: `Your Hellhounds have 3 power, and my Valley is right in front of them.`,
        task: 'Attack my Valley with your Hellhounds: click the Hellhounds, click my Valley, then choose ⚔ Attack Valley.',
        spot: (t) => [U(t, 'dog'), sq(1, 2)],
        ok: (a, t) => isMove(a, t, 'dog') && !!(a as any).attack?.site, nope: 'Step onto my Valley with the Hellhounds and attack the site itself.',
        done: (t) => life(t, 1) === 0,
        solve: (t) => move(t, 'dog', at(1, 2), { site: siteOn(t, 1, 2)!.id }),
      },
      { say: `I'm at 0 life — but the game isn't over. An Avatar at 0 is at **Death's Door**.\n\nAt Death's Door I can't gain life, and **the next damage dealt to my Avatar is a death blow** that ends the game. But not this turn: an Avatar can't die on the turn it reaches Death's Door.\n\nOne more subtlety: life lost through site attacks is *not* damage to the Avatar, so sites can bring me to Death's Door but can never finish me. The last hit has to land on the Avatar itself.` },
      endTurn(`So pass the turn. (A real opponent would now fight for their life — I'll stand still.)`),
      drawStep(`Draw, then finish it.`),
      {
        say: `Your Amazon Warriors stand one step from my Avatar.`,
        task: 'Strike my Avatar with your Amazon Warriors: step onto my square and choose ⚔ Attack Flamecaller.',
        spot: (t) => [U(t, 'war'), U(t, 'foe')],
        ok: (a, t) => isMove(a, t, 'war') && (a as any).attack?.unit === t.ids.foe, nope: 'Attack my Avatar with the Amazon Warriors.',
        done: (t) => t.g.winner === 0,
        solve: (t) => move(t, 'war', at(2, 3), { unit: t.ids.foe }),
      },
    ],
    outro: `That's a win: bring the enemy Avatar to 0 life, then deal one more point of damage to it on a later turn. The same applies to you — at Death's Door, protect your Avatar at all costs.`,
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'defend', chapter: C2, title: 'Defending and intercepting',
    blurb: 'The two things your units can do on the opponent\'s turn.',
    covers: ['Defend', 'Intercept', 'Range of motion', 'Untapped units'],
    build: () => scene({
      sites: [...HOME, ...AWAY],
      units: [
        { key: 'war', p: 0, name: 'Amazon Warriors', x: 2, y: 1 }, { key: 'tro', p: 0, name: 'Cave Trolls', x: 1, y: 1 },
        { key: 'dog', p: 1, name: 'Hellhounds', x: 3, y: 2 }, { key: 'cam', p: 1, name: 'Raal Dromedary', x: 1, y: 2 },
      ],
    }),
    steps: [
      { say: `So far I've let you hit me. In a real game your opponent's **untapped** units get a say — and so do yours, on my turn.\n\n**Defend:** when an enemy attacks a unit or site within one step of one of your untapped units, that unit may tap, move to the fight and take the attack itself.` },
      { ...endTurn(`My Hellhounds are about to attack your Stream, on your right. Your Amazon Warriors are standing next to it, untapped. Pass the turn and be ready.`), done: (t) => t.g.turn >= 2 },
      {
        say: `I'm attacking your **Stream** with my Hellhounds (3 power). If nobody defends, you lose 3 life.\n\nThe game is asking who defends.`,
        task: 'Defend with your Amazon Warriors: click their name in the question, then Defend with 1 unit.',
        spot: (t) => [U(t, 'war')],
        ok: () => false, nope: 'Answer the defend question.',
        foe: (t) => { const d = unit(t, 'dog'); return d && !d.tapped ? move(t, 'dog', at(3, 1), { site: siteOn(t, 3, 1)!.id }) : null },
        done: (t) => !alive(t, 'dog'),
        lost: (t) => (alive(t, 'dog') && unit(t, 'dog')!.tapped && !t.g.prompts.length ? 'The attack got through undefended: your site was hit and you lost 3 life.' : null),
        solve: (t) => (mine(t)?.kind === 'defend' ? answer(t, [t.ids.war]) : mine(t) ? botAction(t.g, 0) : null),
      },
      { say: `Your Warriors stepped onto the Stream, took the attack and killed the Hellhounds. The site was never touched.\n\nDefending **taps** the defender, so it can't defend twice — but it untaps at the start of your turn as usual. Your Avatar can defend too.` },
      {
        say: `The second reaction is **Intercept**. If an enemy uses Move and Attack, ends its step where you have untapped units and **doesn't attack**, your units there may tap to fight it.\n\nMy Dromedary is about to walk onto your Wasteland, where your Cave Trolls are waiting.`,
        task: 'Intercept the Raal Dromedary: choose Intercept with Cave Trolls.',
        spot: (t) => [U(t, 'tro')],
        ok: () => false, nope: 'Answer the intercept question.',
        foe: (t) => { const c = unit(t, 'cam'); return c && !c.tapped ? move(t, 'cam', at(1, 1)) : null },
        done: (t) => !alive(t, 'cam'),
        lost: (t) => (alive(t, 'cam') && unit(t, 'cam')!.tapped && !t.g.prompts.length ? 'The Dromedary walked in unchallenged.' : null),
        solve: (t) => (mine(t)?.kind === 'intercept' ? answer(t, [t.ids.tro]) : mine(t) ? botAction(t.g, 0) : null),
      },
      { say: `Intercepting units don't move — they must already be where the enemy stops.\n\nThe lesson for your own turns: **an attack is only as good as what happens after the defenders react.** Before you attack, look at which enemy units are untapped and within a step of the target. And before you tap your last unit to attack, ask what will be left to defend with.` },
    ],
    outro: `Defend and Intercept are the only two things units do on the opponent's turn. A tapped unit can do neither; a minion with summoning sickness can do both.`,
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'air', chapter: C3, title: 'Airborne and Ranged',
    blurb: 'Flying over the fight and shooting from a distance.',
    covers: ['Airborne', 'Ranged', 'Projectiles'],
    build: () => scene({
      sites: [...HOME, ...AWAY],
      units: [
        { key: 'peg', p: 0, name: 'Plumed Pegasus', x: 2, y: 1 }, { key: 'bow', p: 0, name: 'Sherwood Huntress', x: 1, y: 1 },
        { key: 'cam', p: 1, name: 'Raal Dromedary', x: 3, y: 2 }, { key: 'cat', p: 1, name: 'Snow Leopard', x: 1, y: 2 },
      ],
    }),
    steps: [
      { say: `Many minions have **keywords** — abilities named in bold on the card. Click any card to read it in full.\n\n**Airborne** units fly while on the surface. That gives them three things: they may step **diagonally**, they can't be attacked by units without Airborne, and they can only be intercepted by Airborne or Ranged units.` },
      {
        say: `Your **Plumed Pegasus** is Airborne. My Dromedary is diagonally ahead of it — out of reach for anyone on foot.`,
        task: 'Fly the Pegasus diagonally onto the Raal Dromedary\'s square and choose ⚔ Attack Raal Dromedary.',
        spot: (t) => [U(t, 'peg'), U(t, 'cam')],
        ok: (a, t) => isMove(a, t, 'peg') && (a as any).attack?.unit === t.ids.cam, nope: 'Attack the Dromedary with the Pegasus.',
        done: (t) => !alive(t, 'cam'),
        solve: (t) => move(t, 'peg', at(3, 2), { unit: t.ids.cam }),
      },
      { say: `Airborne is mostly a defensive and mobility ability. A flyer has to swoop down to attack, so **an Airborne attack can be defended by anything**, flying or not.` },
      {
        say: `**Ranged** gives a unit a second way to use its tap: **shoot a projectile one step in a straight line and strike whatever it hits.** The shooter stays where it is and takes no strike in return.\n\nYour **Sherwood Huntress** has Ranged. My Snow Leopard is directly in front of her.`,
        task: 'Shoot the Snow Leopard: click the Huntress, choose Shoot (Ranged 1), then ↑ away.',
        spot: (t) => [U(t, 'bow'), U(t, 'cat')],
        ok: (a, t) => a.t === 'activate' && a.sourceId === t.ids.bow, nope: 'Use the Huntress\'s Ranged shot.',
        done: (t) => !alive(t, 'cat'),
        solve: (t) => ({ t: 'activate', sourceId: t.ids.bow, ability: 'ranged', extra: { direction: 'n' } }),
      },
      { say: `A **projectile** flies in one of the four straight directions and hits the **first unit** on its path — friend or foe — so mind who is standing in the way. Projectiles hit units only, never sites.\n\nA related keyword you'll meet: **Movement +1** lets a unit take one extra step when it moves, attacks or defends.` },
    ],
    outro: `Airborne units choose their fights; Ranged units fight without being hit back.`,
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'under', chapter: C3, title: 'Regions: underground and underwater',
    blurb: 'Burrowing, Submerge, and fighting from below.',
    covers: ['Regions', 'Burrowing', 'Submerge', 'Voidwalk', 'Land and water sites'],
    build: () => scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Valley', 2, 1], [0, 'Stream', 3, 1], [0, 'Wasteland', 1, 1], ...AWAY],
      units: [
        { key: 'tro', p: 0, name: 'Cave Trolls', x: 2, y: 1 }, { key: 'kel', p: 0, name: 'Coral-Reef Kelpie', x: 3, y: 1 },
        { key: 'cam', p: 1, name: 'Raal Dromedary', x: 2, y: 2 },
      ],
    }),
    steps: [
      { say: `Every site has two layers: the **surface**, and a layer beneath it. Under a **land** site lies the **underground**; under a **water** site (one that provides Water, like a Stream) lies the **underwater**. Together with the void, these are the game's four **regions**.\n\nUnits in different regions can't attack each other.` },
      {
        say: `**Burrowing** lets a minion live underground. It spends its step to go down or come up at a land site, or to tunnel between adjacent underground locations.\n\nYour **Cave Trolls** have Burrowing.`,
        task: 'Burrow the Cave Trolls: click them, then ⛏ Burrow.',
        spot: (t) => [U(t, 'tro')],
        ok: (a, t) => isMove(a, t, 'tro'), nope: 'Send the Cave Trolls underground.',
        done: (t) => unit(t, 'tro')?.region === 'underground',
        solve: (t) => move(t, 'tro', at(2, 1, 'underground')),
      },
      {
        say: `**Submerge** is the same idea for water sites. Your **Coral-Reef Kelpie** is standing on a Stream.`,
        task: 'Submerge the Kelpie: click it, then 🌊 Submerge.',
        spot: (t) => [U(t, 'kel')],
        ok: (a, t) => isMove(a, t, 'kel'), nope: 'Send the Kelpie underwater.',
        done: (t) => unit(t, 'kel')?.region === 'underwater',
        solve: (t) => move(t, 'kel', at(3, 1, 'underwater')),
      },
      { say: `Both are now out of reach of anything on the surface, and can travel under my lines. The **Subsurface** button on the left switches the board between the two layers.\n\nA minion with Burrowing or Submerge may also be **summoned** straight into the layer below one of your sites. And a fourth movement keyword, **Voidwalk**, lets a unit step into and through void squares.` },
      endTurn(`Watch what my Dromedary does.`, 3, (t) => { const c = unit(t, 'cam'); return c && !c.tapped && c.y === 2 ? move(t, 'cam', at(2, 1)) : null }),
      drawStep(`My Dromedary is standing right on top of your Trolls and can't touch them.`),
      {
        say: `Coming up uses the Trolls' step — and after a step, a unit may attack.`,
        task: 'Surface the Cave Trolls and attack: click them, then 🏔 Surface, then ⚔ Attack Raal Dromedary.',
        spot: (t) => [U(t, 'tro'), U(t, 'cam')],
        ok: (a, t) => isMove(a, t, 'tro') && (a as any).attack?.unit === t.ids.cam, nope: 'Surface with the Trolls and attack the Dromedary.',
        done: (t) => !alive(t, 'cam'),
        solve: (t) => move(t, 'tro', at(2, 1, 'surface'), { unit: t.ids.cam }),
      },
    ],
    outro: `Regions are Sorcery's third dimension. A unit below the surface is safe from most things — and a threat to everything above it.`,
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'tricks', chapter: C3, title: 'Lethal, Charge and Stealth',
    blurb: 'Three keywords that change how a fight works.',
    covers: ['Lethal', 'Charge', 'Stealth'],
    build: () => scene({
      sites: [...HOME, ...AWAY], hand: ['Wild Fanatic'],
      units: [
        { key: 'rat', p: 0, name: 'Plague Rat', x: 1, y: 1 }, { key: 'dem', p: 0, name: 'Dead of Night Demon', x: 3, y: 1, stealth: true },
        { key: 'war', p: 1, name: 'Amazon Warriors', x: 1, y: 2 }, { key: 'sol', p: 1, name: 'Foot Soldiers', x: 2, y: 2 },
      ],
    }),
    steps: [
      {
        say: `**Lethal:** any damage this unit deals to a minion kills it, however big it is.\n\nYour **Plague Rat** has 1 power and Lethal. My Amazon Warriors have 5.`,
        task: 'Attack the Amazon Warriors with your Plague Rat (click the Rat, the Warriors\' square, then ⚔ Attack).',
        spot: (t) => [U(t, 'rat'), U(t, 'war')],
        ok: (a, t) => isMove(a, t, 'rat') && (a as any).attack?.unit === t.ids.war, nope: 'Attack the Amazon Warriors with the Plague Rat.',
        done: (t) => !alive(t, 'war'),
        solve: (t) => move(t, 'rat', at(1, 2), { unit: t.ids.war }),
      },
      { say: `The Rat died too — strikes are simultaneous — but a 1-cost minion just took down a 5-cost one. Lethal only works on minions: against an Avatar or a site it's just 1 damage.` },
      {
        say: `**Charge:** this minion has no summoning sickness. It can act on the turn it arrives.`,
        task: 'Cast Wild Fanatic onto your Spire.',
        spot: () => [H('Wild Fanatic'), sq(2, 1)],
        ok: (a, t) => isCast(a, t, 'Wild Fanatic') && (a as any).at?.x === 2 && (a as any).at?.y === 1, nope: 'Cast Wild Fanatic onto the Spire in front of your Avatar.',
        done: (t) => !!unitNamed(t, 'Wild Fanatic'),
        solve: (t) => cast(t, 'Wild Fanatic', { at: { x: 2, y: 1 } }),
      },
      {
        say: `It arrived untapped and ready.`,
        task: 'Attack my Foot Soldiers with the Wild Fanatic right away.',
        spot: (t) => [U(t, 'sol')],
        ok: (a, t) => a.t === 'moveAttack' && t.g.units[a.unitId]?.name === 'Wild Fanatic' && (a as any).attack?.unit === t.ids.sol, nope: 'Attack the Foot Soldiers with the Wild Fanatic.',
        done: (t) => !alive(t, 'sol'),
        solve: (t) => ({ t: 'moveAttack', unitId: unitNamed(t, 'Wild Fanatic')!.id, path: [at(2, 2)], attack: { unit: t.ids.sol } }),
      },
      { say: `**Stealth:** a minion with Stealth enters the realm with a stealth mark. While it has the mark, the opponent can't target it with spells, abilities or attacks, projectiles can't hit it, it can't be intercepted — and **its attacks can't be defended**.\n\nThe mark is lost the moment the minion interacts with the realm: strikes, deals damage, or is disabled.` },
      {
        say: `Your **Dead of Night Demon** still has its mark. Nothing I own can stop its first attack.`,
        task: 'Attack my Valley with the Dead of Night Demon: step onto it and choose ⚔ Attack Valley.',
        spot: (t) => [U(t, 'dem'), sq(3, 2)],
        ok: (a, t) => isMove(a, t, 'dem') && !!(a as any).attack?.site, nope: 'Step the Demon onto my Valley and attack the site.',
        done: (t) => life(t, 1) < 20,
        solve: (t) => move(t, 'dem', at(3, 2), { site: siteOn(t, 3, 2)!.id }),
      },
      { say: `Two life, undefended — and the Demon has lost its Stealth by striking.\n\nTwo other keywords you'll see on cards: **Genesis →** an effect that happens when the card enters the realm, and **Deathrite →** an effect that happens when it dies.` },
    ],
    outro: `Read the keywords before you fight: Lethal ignores size, Charge ignores the wait, Stealth ignores defenders.`,
  },
  // ------------------------------------------------------------------ 9
  {
    id: 'magic', chapter: C4, title: 'Magic and projectiles',
    blurb: 'One-shot spells, targets, and shooting in a line.',
    covers: ['Magic', 'Targets', 'Projectiles', 'Spell damage to Avatars'],
    build: () => scene({
      sites: [...HOME, ...AWAY], hand: ['Lightning Bolt', 'Firebolts'],
      units: [{ key: 'dog', p: 1, name: 'Hellhounds', x: 1, y: 2 }, { key: 'sol', p: 1, name: 'Foot Soldiers', x: 2, y: 2 }],
    }),
    steps: [
      { say: `Minions aren't the only spells. A **Magic** is a one-shot effect: you pay for it, it happens, and the card goes to your cemetery.\n\nLike minions, magics are cast by a Spellcaster during your main phase, and need mana and threshold.` },
      {
        say: `**Lightning Bolt** (2 mana, Air) deals 3 damage to a random unit at a location you choose. My Hellhounds are alone on their square, so "random" means them.`,
        task: 'Cast Lightning Bolt on the Hellhounds\' square: click the card, then the square.',
        spot: (t) => [H('Lightning Bolt'), U(t, 'dog')],
        ok: (a, t) => isCast(a, t, 'Lightning Bolt'), nope: 'Cast the Lightning Bolt.',
        done: (t) => !alive(t, 'dog') || !inHand(t, 'Lightning Bolt'),
        lost: (t) => (alive(t, 'dog') && !inHand(t, 'Lightning Bolt') ? 'The bolt landed somewhere else.' : null),
        solve: (t) => cast(t, 'Lightning Bolt', { targets: ['sq:1,2,surface'] }),
      },
      { say: `Read every word of a spell. "Target **location**" is not "target unit": a spell that targets a location can hurt things a targeted spell could not — a minion with Stealth, for instance.` },
      {
        say: `**Firebolts** (2 mana, Fire) shoots **three projectiles in the same direction**, one at a time, each dealing 1 damage. Projectiles start at the caster — your Avatar — and fly straight until they hit the first unit.\n\nStraight ahead of your Avatar stand my Foot Soldiers (1 power), and behind them, me.`,
        task: 'Cast Firebolts straight ahead: click the card, then ↑ away.',
        spot: (t) => [H('Firebolts'), U(t, 'sol')],
        ok: (a, t) => isCast(a, t, 'Firebolts'), nope: 'Cast the Firebolts.',
        done: (t) => !inHand(t, 'Firebolts'),
        solve: (t) => cast(t, 'Firebolts', { extra: { direction: 'n' } }),
      },
      { say: (t) => (life(t, 1) < 20
        ? `The first bolt killed the Foot Soldiers. With nothing left in the way, the other two flew on and hit my Avatar: I'm at ${life(t, 1)} life.\n\nDamage to an Avatar is life loss — and at Death's Door, a single point of spell damage is a death blow. Burn spells end games.`
        : `Those bolts went wide. Fired straight ahead, the first would have killed the Foot Soldiers and the other two would have flown on into my Avatar. Direction matters with projectiles.`) },
    ],
    outro: `Magic is tempo: it costs a card and leaves nothing behind, but it does exactly what you need right now.`,
  },
  // ------------------------------------------------------------------ 10
  {
    id: 'relics', chapter: C4, title: 'Artifacts and auras',
    blurb: 'Things that stay in the realm: carried artifacts and area auras.',
    covers: ['Artifacts', 'Pick Up', 'Drop', 'Carrying', 'Auras'],
    build: () => scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Valley', 2, 1], [0, 'Wasteland', 1, 1], [0, 'Stream', 3, 1], [0, 'Spire', 1, 0], [0, 'Spire', 3, 0], ...AWAY],
      hand: ['Poisonous Dagger', 'Entangle Terrain'],
      units: [
        { key: 'sol', p: 0, name: 'Foot Soldiers', x: 2, y: 1 },
        { key: 'war', p: 1, name: 'Amazon Warriors', x: 2, y: 2 }, { key: 'dog', p: 1, name: 'Hellhounds', x: 1, y: 2 }, { key: 'cam', p: 1, name: 'Raal Dromedary', x: 2, y: 3 },
      ],
    }),
    steps: [
      { say: `**Artifacts** are objects that stay in the realm. Most have no threshold, so any deck can use them. You cast an artifact onto a site you control, where it lies until a unit picks it up — or straight into the hands of one of your units.` },
      {
        say: `**Poisonous Dagger** (2 mana): its bearer has Lethal.`,
        task: 'Cast the Poisonous Dagger: click the card, then the site your Foot Soldiers stand on (or the Soldiers themselves, to hand it straight to them).',
        spot: (t) => [H('Poisonous Dagger'), U(t, 'sol')],
        ok: (a, t) => isCast(a, t, 'Poisonous Dagger') && (((a as any).at?.x === 2 && (a as any).at?.y === 1) || (a as any).extra?.giveTo === t.ids.sol), nope: 'Put the Dagger on the Foot Soldiers\' site, or hand it to them.',
        done: (t) => Object.values(t.g.artifacts).some((a) => a.name === 'Poisonous Dagger'),
        solve: (t) => cast(t, 'Poisonous Dagger', { at: { x: 2, y: 1 } }),
      },
      {
        say: `Every unit has two more basic abilities. **Pick Up:** once on your turn, pick up any artifacts at its location. **Drop:** once on your turn, put down what it carries — but only if the unit hasn't yet done anything else this turn.\n\nNeither one taps the unit.`,
        task: 'Have the Foot Soldiers pick up the Dagger: click the Soldiers, then Pick up Poisonous Dagger.',
        spot: (t) => [U(t, 'sol')],
        ok: (a) => a.t === 'pickUp', nope: 'Pick up the Dagger with the Foot Soldiers.',
        done: (t) => (unit(t, 'sol')?.carrying.length ?? 0) > 0,
        solve: (t) => ({ t: 'pickUp', unitId: t.ids.sol, artifactIds: [Object.values(t.g.artifacts).find((a) => a.name === 'Poisonous Dagger')!.id] }),
      },
      {
        say: `A carried artifact moves with its bearer. Your 1-power Foot Soldiers are now Lethal.`,
        task: 'Attack the Amazon Warriors with the Foot Soldiers.',
        spot: (t) => [U(t, 'sol'), U(t, 'war')],
        ok: (a, t) => isMove(a, t, 'sol') && (a as any).attack?.unit === t.ids.war, nope: 'Attack the Amazon Warriors with the Foot Soldiers.',
        done: (t) => !alive(t, 'war'),
        solve: (t) => move(t, 'sol', at(2, 2), { unit: t.ids.war }),
      },
      { say: `The Warriors are dead, and so are your Soldiers. The Dagger didn't go to the cemetery: **when a bearer dies, what it carried drops where it fell.** It's lying on my site now, and anyone who walks there can pick it up — including my units.` },
      {
        say: `**Auras** are lasting enchantments on the realm itself. Most cover a **2×2 area** and can be cast anywhere.\n\n**Entangle Terrain** (4 mana, two Earth): minions on the affected sites lose Airborne and are **Immobile** — they can't take steps. It lasts three of your turns.`,
        task: 'Cast Entangle Terrain so that it covers my Hellhounds and my Raal Dromedary: click the card, then the square my Hellhounds stand on — the area covers that square and the three up and to the right of it.',
        spot: (t) => [H('Entangle Terrain'), U(t, 'dog'), U(t, 'cam')],
        ok: (a, t) => isCast(a, t, 'Entangle Terrain'), nope: 'Cast Entangle Terrain.',
        done: (t) => Object.values(t.g.auras).some((a) => a.name === 'Entangle Terrain'),
        solve: (t) => cast(t, 'Entangle Terrain', { at: { x: 1, y: 2 } }),
      },
      { say: `Anything standing in that area is rooted. An Immobile unit can still attack and defend where it stands; it just can't step.\n\nAuras come in other shapes too — walls sit on the border between two squares, for example — and the card always says what it covers.` },
    ],
    outro: `Minions die and magic is spent, but artifacts and auras keep working. Watch what's lying on the ground.`,
  },
  // ------------------------------------------------------------------ 11
  {
    id: 'casters', chapter: C4, title: 'Spellcasters',
    blurb: 'Who casts a spell decides where it comes from.',
    covers: ['Spellcaster', 'Choosing the caster', 'Elemental spellcasters'],
    build: () => scene({
      sites: [...HOME, ...AWAY], hand: ['Firebolts'],
      units: [{ key: 'wiz', p: 0, name: 'Apprentice Wizard', x: 0, y: 2 }, { key: 'dog', p: 1, name: 'Hellhounds', x: 3, y: 2 }],
      at: [null, null],
    }),
    steps: [
      { say: `Your Avatar isn't your only caster. Any unit with the **Spellcaster** keyword can cast your spells — and a spell always comes **from the unit that casts it**.\n\nThat matters for anything with a position: projectiles start at the caster, and "nearby" or "adjacent" are measured from the caster.` },
      {
        say: `My Hellhounds are off to the side, where your Avatar's projectiles can't reach. But your **Apprentice Wizard** is standing in their row.`,
        task: 'Cast Firebolts with the Apprentice Wizard: click the card, click the Wizard when asked who casts, then → toward the Hellhounds.',
        spot: (t) => [H('Firebolts'), U(t, 'wiz'), U(t, 'dog')],
        ok: (a, t) => isCast(a, t, 'Firebolts') && (a as any).casterId === t.ids.wiz, nope: 'Choose the Apprentice Wizard as the caster.',
        done: (t) => !inHand(t, 'Firebolts'),
        solve: (t) => ({ t: 'castSpell', cardId: inHand(t, 'Firebolts')!, casterId: t.ids.wiz, extra: { direction: 'e' } }),
      },
      { say: (t) => (alive(t, 'dog')
        ? `Those went the wrong way — fired toward the Hellhounds, all three bolts would have hit them for 3 damage in total.`
        : `Three bolts, 3 damage, dead Hellhounds — from a square your Avatar could never have shot from.`)
        + `\n\nSome casters are limited: a "**Fire Spellcaster**" may only cast spells that need Fire threshold. And casting doesn't tap the caster, so one Spellcaster can cast several spells in a turn.` },
    ],
    outro: `A forward Spellcaster extends your reach across the realm. It's also the first thing your opponent will want dead.`,
  },
  // ------------------------------------------------------------------ 12
  {
    id: 'traps', chapter: C5, title: 'Traps',
    blurb: 'Face-down sites, and springing them at the right moment.',
    covers: ['Trap (X)', 'Face-down sites', 'Springing a trap'],
    build: () => scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Spire', 1, 0], [0, 'Wasteland', 3, 0], [1, 'Wasteland', 2, 3], [1, 'Wasteland', 2, 2]],
      hand: ['Spike Trap'],
      units: [{ key: 'dog', p: 1, name: 'Hellhounds', x: 2, y: 2 }],
    }),
    steps: [
      { say: `**Traps** are new with *Frost Mage vs Lavamancer*. A trap is a **site** with the ability **Trap (X)**.\n\nWhen you play one it enters the realm **face down**, disguised as the plain basic site of its element — a Valley for Earth, a Spire for Air, a Wasteland for Fire, a Stream for Water. While face down it *is* that ordinary site for every purpose: it gives mana and threshold, and your opponent can't tell the difference.` },
      {
        say: `**Spike Trap** — *Trap (1) → Deal 3 damage to a unit here.* It's an Earth site, so it will look like a Valley.\n\nMy Hellhounds are two steps in front of your Avatar. Lay the trap in their path.`,
        task: 'Play Spike Trap on the square directly in front of your Avatar.',
        spot: () => [H('Spike Trap'), sq(2, 1)],
        ok: (a) => a.t === 'avatarSite' && a.mode === 'play' && a.x === 2 && a.y === 1, nope: 'Play Spike Trap on the square straight ahead of your Avatar.',
        done: (t) => !!siteOn(t, 2, 1),
        solve: (t) => ({ t: 'avatarSite', mode: 'play', cardId: inHand(t, 'Spike Trap')!, x: 2, y: 1 }),
      },
      { say: `From my side of the table that's a Valley. You can always check your own face-down sites — click it and you'll see the real card.\n\nA trap does nothing by itself. **Springing** it is an activated ability: on your turn, pay X to flip it face up and resolve its effect. So the skill is patience — wait until something worth hitting is standing on it.` },
      endTurn(`Pass the turn and let me walk into it.`, 3, (t) => { const d = unit(t, 'dog'); return d && !d.tapped && d.y === 2 ? move(t, 'dog', at(2, 1)) : null }),
      drawStep(`My Hellhounds marched onto your "Valley". They have 3 power — exactly what the spikes deal.`),
      {
        say: `Spike Trap costs **1** to spring.`,
        task: 'Spring the trap: click the site itself (its card, under the Hellhounds), then Spring (1).',
        spot: () => [sq(2, 1)],
        ok: (a) => a.t === 'activate' && a.ability === 'trap:spring', nope: 'Click the trapped site and spring it.',
        done: (t) => !alive(t, 'dog'),
        solve: (t) => ({ t: 'activate', sourceId: siteOn(t, 2, 1)!.id, ability: 'trap:spring' }),
      },
      { say: `The site flipped face up — it's a Spike Trap for good now — and the Hellhounds are gone. A sprung trap stays in the realm as a normal site and keeps giving mana.\n\nThe finer points:\n\n• You can only spring a trap on **your own turn**, like any activated ability.\n• A face-down trap that is **silenced or disabled** can't be sprung.\n• Some cards **disarm** a trap (flip it up without the effect) or **reset** it (flip it back down).\n• Other traps do other things: **Landslide** — *Trap (2)* — swaps places with an adjacent site.` },
    ],
    outro: `From now on every plain Valley, Spire, Wasteland or Stream across the table might be a trap. Count your opponent's unspent mana before you step onto one.`,
  },
  // ------------------------------------------------------------------ 13
  {
    id: 'collection', chapter: C5, title: 'The collection',
    blurb: 'Ten extra cards outside your deck, and how to reach them.',
    covers: ['Collection', 'Toolbox', 'Casting from the collection'],
    build: () => scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [0, 'Wasteland', 1, 1], [0, 'Stream', 3, 1], [0, 'Spire', 1, 0], ...AWAY],
      hand: ['Toolbox'], collection: { 'Lightning Bolt': 1, 'Heat Ray': 1, 'Amazon Warriors': 1, Hellhounds: 2 },
      units: [{ key: 'dog', p: 1, name: 'Hellhounds', x: 2, y: 2 }],
    }),
    steps: [
      { say: `Besides a spellbook and an atlas, a deck may bring a **collection**: up to **10 cards** set aside outside the game. The preconstructed Frost Mage and Lavamancer decks each come with one.\n\nYou may look at your own collection at any time — the **collection** button next to your name. Your opponent only knows how many cards are in it.\n\nCollection cards never get drawn. They enter the game only when a card says "**from your collection**".` },
      {
        say: `**Toolbox** (artifact, 2 mana): *Sacrifice → Bearer may cast an Ordinary spell from your collection.*\n\nFirst get it into the realm.`,
        task: 'Cast Toolbox: click the card, then your Avatar (or the site it stands on).',
        spot: (t) => [H('Toolbox'), U(t, 'me')],
        ok: (a, t) => isCast(a, t, 'Toolbox') && (((a as any).at?.x === 2 && (a as any).at?.y === 0) || (a as any).extra?.giveTo === t.ids.me), nope: 'Give the Toolbox to your Avatar, or put it on your Avatar\'s site.',
        done: (t) => Object.values(t.g.artifacts).some((a) => a.name === 'Toolbox'),
        solve: (t) => cast(t, 'Toolbox', { at: { x: 2, y: 0 } }),
      },
      {
        say: `The Toolbox is lying on the ground. To be used it needs a **bearer**.`,
        task: 'Pick up the Toolbox with your Avatar: click your Avatar, then Pick up Toolbox.',
        spot: (t) => [U(t, 'me')],
        ok: (a) => a.t === 'pickUp', nope: 'Pick up the Toolbox with your Avatar.',
        done: (t) => (unit(t, 'me')?.carrying.length ?? 0) > 0,
        solve: (t) => ({ t: 'pickUp', unitId: t.ids.me, artifactIds: [Object.values(t.g.artifacts).find((a) => a.name === 'Toolbox')!.id] }),
      },
      {
        say: `Now use it. You'll be shown the Ordinary spells in your collection that you can pay for right now — you still pay the spell's own mana cost and need its threshold.\n\nMy Hellhounds are in front of your Spire. **Lightning Bolt** would deal with them.`,
        task: 'Click your Avatar, choose the Toolbox ability, pick Lightning Bolt, and aim it at the Hellhounds\' square.',
        spot: (t) => [U(t, 'me'), U(t, 'dog')],
        ok: (a) => a.t === 'activate', nope: 'Click the Toolbox (or your Avatar) and use its ability.',
        done: (t) => !Object.values(t.g.artifacts).some((a) => a.name === 'Toolbox') && !t.g.prompts.length,
        solve: (t) => {
          const p = mine(t)
          if (p?.kind === 'nameCard') return answer(t, 'Lightning Bolt')
          if (p?.kind === 'chooseSquare') return answer(t, { x: 2, y: 2 })
          if (p) return botAction(t.g, 0)
          return { t: 'activate', sourceId: Object.values(t.g.artifacts).find((a) => a.name === 'Toolbox')!.id, ability: 'rummage' }
        },
      },
      { say: (t) => (alive(t, 'dog') ? `The Toolbox is spent, though the Hellhounds are still standing — a Lightning Bolt on their square would have removed them.` : `The Toolbox was sacrificed, the Lightning Bolt came out of your collection, and the Hellhounds are gone.`)
        + `\n\nThat's the point of a collection: a small **toolkit of answers** you can reach when you need them, without diluting your deck. In constructed play it holds up to 10 cards and follows the normal rarity limits.\n\nOther cards reach into it in their own way — **Ancient Thaw** casts a Beast from it, for example — so read what each one is allowed to fetch.` },
    ],
    outro: `When you build a deck, build the collection too: think about which problems your deck can't solve, and put the answers there.`,
  },
  // ------------------------------------------------------------------ 14
  {
    id: 'ice', chapter: C5, title: 'Disabled, Outerbound and Protected',
    blurb: 'The Frost Mage\'s ice and the other new rules of the set.',
    covers: ['Disabled', 'Avatar abilities', 'Outerbound', 'Protected from X', 'Permafrost'],
    build: () => scene({
      avatars: ['Frost Mage', 'Lavamancer'],
      sites: [[0, 'Spire', 2, 0], [0, 'Spire', 1, 0], [0, 'Stream', 3, 0], [0, 'Stream', 2, 1], [0, 'Spire', 0, 0], [0, 'Spire', 0, 1], [1, 'Wasteland', 2, 3], [1, 'Wasteland', 0, 2], [1, 'Wasteland', 1, 3], [1, 'Wasteland', 0, 3]],
      units: [
        { key: 'yeti', p: 0, name: 'A Yeti So Shy', x: 0, y: 1, stealth: true },
        { key: 'war', p: 1, name: 'Amazon Warriors', x: 2, y: 1 }, { key: 'sol', p: 1, name: 'Foot Soldiers', x: 0, y: 2 },
      ],
    }),
    steps: [
      { say: `Avatars differ in their second ability. You're playing the **Frost Mage**:\n\n*(Air)(Air)(Water)(Water), 2 mana, once on your turn → Encase target nearby minion in ice. It is disabled and takes no damage until your next turn.*\n\nThe symbols are a threshold you must have, the 2 is mana you pay. **Nearby** means the same square or any of the eight around it — diagonals included. (**Adjacent** means only the four sharing an edge.)` },
      {
        say: `My Amazon Warriors are standing on your Stream, one step from your Avatar, ready to hit you for 5.`,
        task: 'Encase the Amazon Warriors: click your Avatar, choose Encase a nearby minion in ice, then click the Warriors.',
        spot: (t) => [U(t, 'me'), U(t, 'war')],
        ok: (a, t) => a.t === 'activate' && a.sourceId === t.ids.me, nope: 'Use your Avatar\'s Encase ability.',
        done: (t) => !!unit(t, 'war')?.modifiers.some((m: any) => m.keyword === 'disabled'),
        solve: (t) => ({ t: 'activate', sourceId: t.ids.me, ability: 'encase', targets: [t.ids.war] }),
      },
      { say: `The Warriors are **disabled**. A disabled minion has no abilities at all — not even Move and Attack or Defend. It can't strike, deal damage, take a step or be tapped for a cost, and it loses any Stealth mark. It can still be pushed around by effects.\n\nThis ice wears off at the start of your next turn. Two cards from the set change that:\n\n• **Permafrost** (site): disables on minions there never wear off — until the minion leaves.\n• **Hibernal Legion** (minion): freezes its own site and everything else on it for as long as it stays.` },
      { say: `**Outerbound** is a new keyword: the minion is **disabled unless it stands on the outside edge of the realm** — the outer ring of squares.\n\nYour **A Yeti So Shy** is a 4-power Stealth minion for only 4 mana. The price is that it has to stay on the rim. If it ever ends up on an inner square it freezes — and a disabled minion can't walk itself back out.`, spot: (t) => [U(t, 'yeti')] },
      {
        say: `It's on the left edge now, and so are my Foot Soldiers.`,
        task: 'Attack my Foot Soldiers with the Yeti, staying on the edge (click the Yeti, the Soldiers\' square, then ⚔ Attack).',
        spot: (t) => [U(t, 'yeti'), U(t, 'sol')],
        ok: (a, t) => isMove(a, t, 'yeti') && (a as any).attack?.unit === t.ids.sol, nope: 'Attack the Foot Soldiers with the Yeti.',
        done: (t) => !alive(t, 'sol'),
        solve: (t) => move(t, 'yeti', at(0, 2), { unit: t.ids.sol }),
      },
      { say: `The last new rule is **Protected from X**. A protected unit can't be targeted, damaged, moved, disabled or stopped by X.\n\n• **Highgate Guide:** nearby allies are *Protected from sites* — site abilities, traps included, don't touch them.\n• **Humming Hummocks:** gives *Protected from all but units* — only units can affect them; spells, sites and auras can't.\n\nSo a Spike Trap won't hurt a minion walking beside a Highgate Guide. Check for one before you spend the mana.` },
    ],
    outro: `That's every rule the new set adds: traps, the collection, Outerbound, Protected, and the ice that makes "disabled" matter.`,
  },
  // ------------------------------------------------------------------ 15
  {
    id: 'match', chapter: C6, title: 'A full game, with coaching',
    blurb: 'Frost Mage against my Lavamancer, from the opening hand. I play for real and advise as you go.',
    covers: ['Mulligan', 'First site', 'A complete game', 'Both precon decks'],
    freePlay: true,
    build: () => {
      const me = PRECONS.find((p) => p.id === 'precon:fvl-frost')!, foe = PRECONS.find((p) => p.id === 'precon:fvl-lava')!
      const g = createGame([me, foe], ['You', 'Coach'], Math.floor(Math.random() * 0xffffffff), 0)
      return { g, ids: { me: g.players[0].avatarUnitId, foe: g.players[1].avatarUnitId } }
    },
    steps: [{
      say: (t) => matchAdvice(t),
      task: 'Win the game.',
      done: (t) => t.g.phase === 'over',
      solve: (t) => botAction(t.g, 0),
    }],
    outro: `That's a complete game of Sorcery. Play it again from the lesson list whenever you like — or head to the main menu, pick any two decks and play the computer without the commentary.`,
  },
]

/** the coach's running commentary for the free game: one piece of advice for the position in front of you */
export function matchAdvice(t: Tut): string {
  const g = t.g, me: PlayerId = 0
  const p = g.players[me], av = g.units[p.avatarUnitId]
  const prompt = g.prompts[0]
  const names = p.hand.map((id) => g.cards[id]?.name ?? '')
  if (g.phase === 'over') return g.winner === 0 ? `You won. Well played.` : g.winner === 1 ? `I got you this time. Have another go — the decks are evenly matched.` : `A draw — both Avatars fell at once.`
  if (g.phase === 'mulligan') return `This is a real game: you with the **Frost Mage** deck, me with the **Lavamancer**.\n\nYou start with three sites and three spells. Once per game you may **mulligan**: put up to three cards on the bottom of their decks and draw replacements. Keep a hand with cheap spells you can cast in the first turns; send back expensive cards you won't afford for a while.`
  if (prompt?.player === me) {
    if (prompt.kind === 'firstSite') return `Your very first site goes under your Avatar. Pick one that gives the elements your hand needs — this deck is **Air and Water**.`
    if (prompt.kind === 'drawDeck') {
      const sites = names.filter(isSiteName).length
      return sites === 0 ? `Draw from your **atlas**: you have no site in hand, and you want to play one every turn for the first five or six turns.` : sites >= 2 && names.length - sites <= 1 ? `You have sites to spare and few spells: draw from your **spellbook**.` : `Draw a card. Rule of thumb: atlas if you couldn't play a site next turn, otherwise spellbook.`
    }
    if (prompt.kind === 'defend') return `I'm attacking. If one of your untapped units takes the fight, the original target is spared. Compare powers first: defend when your defender wins or trades well, or when the life you'd lose matters more than the minion.`
    if (prompt.kind === 'intercept') return `One of my units stopped next to yours without attacking. Intercept if your unit wins that fight.`
    return `Answer the question on screen — read the card it comes from if you're unsure.`
  }
  if (g.activePlayer !== me) return `My turn. Watch which of my units tap: a tapped unit can't defend on your turn.`
  if (av?.deathsDoor) return `You're at **Death's Door**: any damage to your Avatar loses the game. Keep untapped defenders next to it, and stay out of straight lines my projectiles can travel.`
  const foeAv = g.units[g.players[1].avatarUnitId]
  if (foeAv?.deathsDoor) return `I'm at **Death's Door**. One point of damage to my Avatar wins — a strike, a Frostbolt, anything. Find it.`
  if (av && !av.tapped && names.some(isSiteName)) return `Start your turn by **playing a site**: more mana every turn is worth more than almost anything else early on. Remember the traps in this set are sites too.`
  if (av && !av.tapped && !names.some(isSiteName) && Object.values(g.sites).filter((s) => s.controller === me).length < 6) return `No site in hand — tap your Avatar to **draw one** from your atlas so you can play it next turn.`
  if (p.mana >= 2 && names.some((n) => !isSiteName(n))) return `You have **${p.mana} mana** left. Spend it: cast the most expensive spell you can afford, checking its threshold. Your Avatar can also **Encase** a nearby minion for 2 once you have two Air and two Water.`
  const ready = Object.values(g.units).filter((u) => u.controller === me && !u.isAvatar && !u.tapped && u.enteredTurn !== g.turn)
  if (ready.length) return `You have untapped minions. Before attacking, look at what I have untapped within a step of the target — those can defend. Attacking a site costs me life; killing a minion costs me a card. And keep something untapped near your Avatar.`
  return `Nothing left to do? End your turn. Unspent mana is lost, but untapped units will defend for you.`
}
const SITE_NAMES = new Set<string>()
function isSiteName(n: string): boolean {
  if (!SITE_NAMES.size) for (const p of PRECONS) for (const s of Object.keys(p.atlas)) SITE_NAMES.add(s)
  return SITE_NAMES.has(n)
}

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id)
