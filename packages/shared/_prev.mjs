import { newGame, keepBoth, summonCard, placeSite, giveArtifact, answer } from './test/helpers.ts'
import { dealDamageToUnit, checkStateBased } from './src/index.ts'

function run(orderPick) {
  const g = newGame(); keepBoth(g)
  g.activePlayer = 0 // attacker's turn
  placeSite(g,1,'Rustic Village',2,2)
  const victim = summonCard(g,1,'Escyllion Cyclops',2,2); victim.enteredTurn=-1 // defender's unit (6 def, survives)
  giveArtifact(g, victim, 'Goswhit Helmet')  // worn by the victim
  // Makeshift Barricade sheltering the victim
  g.cards['bar']={id:'bar',name:'Makeshift Barricade',owner:1}
  g.artifacts['bar']={id:'bar',cardId:'bar',name:'Makeshift Barricade',conjuredBy:1,x:2,y:2,region:'surface',carriedBy:null,tapped:false,counters:{}}
  // strike 3 from a Saracen-like attacker (player 0)
  dealDamageToUnit(g, g.units[victim.id], 3, 0, { source:{player:0,kind:'strike',attackerId:'atk',name:'Saracen Riders'} })
  const p = g.prompts[0]
  console.log(`\n== order pick ${JSON.stringify(orderPick)} ==`)
  console.log('prompt kind:', p?.kind, 'player:', p?.player, 'cards:', JSON.stringify(p?.data?.cards))
  if (p?.kind === 'orderCards') { answer(g, orderPick) }
  checkStateBased(g)
  const helmetLeft = Object.values(g.artifacts).some(a=>a.name==='Goswhit Helmet')
  const barLeft = Object.values(g.artifacts).some(a=>a.name==='Makeshift Barricade')
  console.log('victim damage:', g.units[victim.id]?.damage, '| helmet remains:', helmetLeft, '| barricade remains:', barLeft)
}
run([0,1])
run([1,0])
