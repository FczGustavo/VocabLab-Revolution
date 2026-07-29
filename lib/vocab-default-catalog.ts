import type { Flashcard, LexicalUsageStatus } from "@/lib/types"

export const VOCAB_DEFAULT_CATALOG_VERSION = 6
export const VOCAB_DEFAULT_FOLDER_NAME = "Phrasal Verbs Essentials"
export const VOCAB_DEFAULT_FOLDER_COLOR = "default"

export type VocabCatalogEntry = Omit<Flashcard, "id" | "folderId" | "createdAt" | "audioSrc" | "catalogContentHash">

const SYNONYMS: Record<string, string[]> = {
  "put away": ["store", "tidy"], "lay off": ["dismiss", "discharge"], "creep in": ["slip in", "infiltrate"],
  "cut off": ["disconnect", "isolate"], "wind up": ["end up", "finish"], "keep up with": ["match", "follow"],
  "look out": ["beware", "watch out"], "stick out": ["stand out", "protrude"], "turn over": ["flip", "transfer"],
  "figure out": ["solve", "understand"], "pull into": ["arrive at", "enter"], "put up with": ["tolerate", "endure"],
  "pick on": ["bully", "harass"], "put off": ["postpone", "delay"], "go over": ["review", "examine"],
  "go up": ["rise", "increase"], "keep in": ["confine", "retain"], "call out": ["summon", "challenge"],
  "call down": ["reprimand", "rebuke"], "get out": ["leave", "escape"], "rack up": ["accumulate", "amass"],
  "blow up": ["explode", "enlarge"], "take place": ["happen", "occur"], "grow up": ["mature", "develop"],
  "watch out": ["beware", "take care"], "turn down": ["reject", "reduce"], "turn up": ["appear", "increase"],
  "turn away": ["reject", "repel"], "turn out": ["prove", "result"], "plow into": ["crash into", "ram"],
  "put forward": ["propose", "present"], "turn in": ["submit", "hand in"], "bring about": ["cause", "produce"],
  "take after": ["resemble"], "look down on": ["despise", "disdain"], "break out": ["erupt", "begin"],
  "catch up on": ["complete", "update"], "call on": ["visit", "request"], "look up": ["search for", "consult"],
  "pick out": ["choose", "identify"], "wire up": ["connect", "install"], "track down": ["locate", "find"],
  "get along": ["cooperate", "get on"], "set sail": ["depart", "embark"], "take apart": ["dismantle", "disassemble"],
  "come up with": ["devise", "invent"], "get ahead": ["advance", "prosper"], "catch up with": ["reach", "overtake"],
  "come across": ["encounter", "find"], "bounce off": ["rebound", "ricochet"], "live up to": ["fulfill", "meet"],
  "stand up to": ["confront", "resist"], "stand up for": ["defend", "support"], "stand in for": ["substitute for", "replace"],
  "give in": ["surrender", "yield"], "cut down on": ["reduce", "limit"], "ship off": ["dispatch", "send away"],
  "carry out": ["perform", "execute"], "run out of": ["exhaust", "use up"], "fill up": ["fill", "replenish"],
  "get by": ["manage", "cope"], "run over": ["overrun", "hit"], "knock down": ["demolish", "topple"],
  "keep away": ["avoid", "stay away"], "lay away": ["reserve", "set aside"], "put about": ["change course", "turn"],
  "put across": ["convey", "communicate"], "run aground": ["strand", "ground"], "take on water": ["flood", "leak"],
  "cast off": ["unmoor", "depart"], "cut out": ["eliminate", "remove"], "take up": ["begin", "adopt"],
  "walk out": ["leave", "depart"], "look into": ["investigate", "examine"], "wear off": ["fade", "subside"],
  "take over": ["assume control", "replace"], "push back": ["postpone", "resist"], "go down": ["fall", "decrease"],
  "run into": ["encounter", "collide with"], "get over": ["recover from", "overcome"], "stay up": ["remain awake"],
  "switch on": ["activate", "turn on"], "eat out": ["dine out"], "write down": ["record", "note"],
  "set off": ["depart", "embark"], "look for": ["search for", "seek"], "look out for": ["watch for", "be alert to"],
  "pick up": ["collect", "lift"], "start off": ["begin", "set out"], "cope with": ["handle", "manage"],
  "break off": ["end", "interrupt"], "end up": ["wind up", "finish"], "bring up": ["raise", "mention"],
  "look forward to": ["anticipate", "await eagerly"], "stand out": ["excel", "be prominent"], "get away with": ["escape punishment for"],
  "split up": ["separate", "break up"], "go off": ["explode", "sound"], "pull away": ["move away", "draw ahead"],
  "pull in": ["arrive", "attract"], "pull off": ["accomplish", "achieve"], "pull over": ["stop", "draw over"],
  "break down": ["fail", "collapse"], "put out": ["extinguish", "publish"], "stem from": ["arise from", "derive from"],
  "carry on": ["continue", "proceed"], "carry away": ["overexcite", "sweep away"], "bump off": ["murder", "kill"],
  "come over": ["visit", "come by"], "keep down": ["suppress", "control"], "fade away": ["disappear", "diminish"],
  "count on": ["rely on", "trust"], "take out": ["remove", "extract"], "clean up": ["tidy", "clear up"],
  "give up": ["quit", "surrender"], "go on": ["continue", "proceed"], "give away": ["donate", "reveal"],
  "deal with": ["handle", "address"], "throw away": ["discard", "dispose of"], "hang around": ["linger", "wait around"],
  "run through": ["review", "rehearse"], "hang out": ["socialize", "spend time"],
}

const ANTONYMS: Record<string, string[]> = {
  "put away": ["take out"], "lay off": ["hire"], "cut off": ["connect"], "keep up with": ["fall behind"],
  "stick out": ["blend in"], "put up with": ["reject"], "put off": ["bring forward"], "go up": ["go down"],
  "keep in": ["let out"], "get out": ["stay in"], "blow up": ["deflate"], "grow up": ["remain immature"],
  "turn down": ["accept"], "turn up": ["turn down"], "turn away": ["admit"], "look down on": ["respect"],
  "get along": ["fall out"], "take apart": ["assemble"], "get ahead": ["fall behind"], "give in": ["resist"],
  "fill up": ["empty"], "knock down": ["build up"], "keep away": ["approach"], "cut out": ["include"],
  "take up": ["give up"], "walk out": ["stay"], "take over": ["hand over"], "go down": ["go up"],
  "stay up": ["go to bed"], "switch on": ["switch off"], "eat out": ["eat in"],
  "set off": ["arrive"], "look for": ["find"], "pick up": ["put down"], "start off": ["finish"],
  "break off": ["continue"], "stand out": ["blend in"], "split up": ["get together"], "pull away": ["approach"],
  "pull in": ["pull out"], "break down": ["work"], "put out": ["ignite"], "carry on": ["stop"],
  "fade away": ["intensify"], "take out": ["put in"], "clean up": ["mess up"], "give up": ["persist"],
  "go on": ["stop"], "give away": ["keep"], "throw away": ["keep"], "hang around": ["leave"],
}

const IPA_WORDS: Record<string, string> = {
  put: "pʊt", away: "əˈweɪ", lay: "leɪ", off: "ɔf", creep: "krip", in: "ɪn", cut: "kʌt", wind: "waɪnd", up: "ʌp", to: "tu", back: "bæk",
  keep: "kip", with: "wɪð", look: "lʊk", out: "aʊt", stick: "stɪk", turn: "tɝn", over: "ˈoʊvɚ", figure: "ˈfɪɡjɚ",
  pull: "pʊl", into: "ˈɪntu", pick: "pɪk", on: "ɑn", go: "ɡoʊ", call: "kɔl", down: "daʊn", get: "ɡɛt",
  rack: "ræk", blow: "bloʊ", take: "teɪk", place: "pleɪs", grow: "ɡroʊ", watch: "wɑtʃ", plow: "plaʊ", forward: "ˈfɔrwɚd",
  bring: "brɪŋ", after: "ˈæftɚ", break: "breɪk", catch: "kætʃ", wire: "waɪr", track: "træk", along: "əˈlɔŋ",
  set: "sɛt", sail: "seɪl", apart: "əˈpɑrt", come: "kʌm", ahead: "əˈhɛd", across: "əˈkrɔs", bounce: "baʊns",
  live: "lɪv", stand: "stænd", for: "fɔr", give: "ɡɪv", ship: "ʃɪp", carry: "ˈkæri", run: "rʌn", of: "əv",
  fill: "fɪl", by: "baɪ", knock: "nɑk", about: "əˈbaʊt", aground: "əˈɡraʊnd", water: "ˈwɔtɚ", cast: "kæst",
  walk: "wɔk", wear: "wɛr", push: "pʊʃ", stay: "steɪ", switch: "swɪtʃ", eat: "it", write: "raɪt",
  start: "stɑrt", cope: "koʊp", end: "ɛnd", split: "splɪt", stem: "stɛm",
  bump: "bʌmp", fade: "feɪd", count: "kaʊnt", clean: "klin", deal: "dil", throw: "θroʊ", hang: "hæŋ", through: "θru", from: "frʌm", around: "əˈraʊnd",
}

const IRREGULAR: Record<string, { past: string; participle: string; ing?: string; third?: string }> = {
  put: { past: "put", participle: "put", ing: "putting" }, lay: { past: "laid", participle: "laid" },
  creep: { past: "crept", participle: "crept" }, cut: { past: "cut", participle: "cut", ing: "cutting" },
  wind: { past: "wound", participle: "wound" }, keep: { past: "kept", participle: "kept" },
  stick: { past: "stuck", participle: "stuck" }, get: { past: "got", participle: "gotten", ing: "getting" },
  blow: { past: "blew", participle: "blown" }, take: { past: "took", participle: "taken" },
  grow: { past: "grew", participle: "grown" }, go: { past: "went", participle: "gone", third: "goes" },
  bring: { past: "brought", participle: "brought" }, break: { past: "broke", participle: "broken" },
  catch: { past: "caught", participle: "caught" }, set: { past: "set", participle: "set", ing: "setting" },
  come: { past: "came", participle: "come" }, stand: { past: "stood", participle: "stood" },
  give: { past: "gave", participle: "given" }, run: { past: "ran", participle: "run", ing: "running" },
  cast: { past: "cast", participle: "cast" }, wear: { past: "wore", participle: "worn" },
  eat: { past: "ate", participle: "eaten" }, write: { past: "wrote", participle: "written", ing: "writing" },
  split: { past: "split", participle: "split", ing: "splitting" }, deal: { past: "dealt", participle: "dealt" },
  throw: { past: "threw", participle: "thrown" }, hang: { past: "hung", participle: "hung" },
}

function regularThird(verb: string) {
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`
  return `${verb}s`
}

function regularPast(verb: string) {
  if (verb === "ship") return "shipped"
  if (verb === "stem") return "stemmed"
  if (verb === "bump") return "bumped"
  if (verb.endsWith("e")) return `${verb}d`
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ied`
  return `${verb}ed`
}

function regularIng(verb: string) {
  if (verb === "ship") return "shipping"
  if (verb === "stem") return "stemming"
  if (verb === "bump") return "bumping"
  if (verb.endsWith("ie")) return `${verb.slice(0, -2)}ying`
  if (verb.endsWith("e") && !verb.endsWith("ee")) return `${verb.slice(0, -1)}ing`
  return `${verb}ing`
}

function conjugationsFor(phrasalVerb: string): NonNullable<Flashcard["conjugations"]> {
  const [head, ...particles] = phrasalVerb.split(" ")
  const tail = particles.length ? ` ${particles.join(" ")}` : ""
  const irregular = IRREGULAR[head]
  const third = irregular?.third ?? regularThird(head)
  const past = irregular?.past ?? regularPast(head)
  const participle = irregular?.participle ?? past
  const ing = irregular?.ing ?? regularIng(head)
  return {
    simplePresent: `${head}${tail} / ${third}${tail}`,
    simplePast: `${past}${tail}`,
    presentContinuous: `am/is/are ${ing}${tail}`,
    pastContinuous: `was/were ${ing}${tail}`,
    presentPerfect: `have/has ${participle}${tail}`,
    pastPerfect: `had ${participle}${tail}`,
  }
}

const e = (
  catalogId: string,
  word: string,
  translation: string,
  _legacyUsageNote: string,
  example: string,
  exampleTranslation: string,
  usageStatus: LexicalUsageStatus = "current",
): VocabCatalogEntry => ({
  catalogId,
  catalogRevision: 6,
  word,
  partOfSpeech: "phrasal-verb",
  translation: translation.split(";").map((item) => item.trim()).filter(Boolean).slice(0, 2).join(" / "),
  ipa: word.split(" ").map((part) => IPA_WORDS[part] ?? part).join(" "),
  usageNote: "",
  usageNoteEn: "",
  synonyms: (SYNONYMS[word] ?? []).map((item) => ({ word: item, type: "literal" })),
  antonyms: (ANTONYMS[word] ?? []).map((item) => ({ word: item, type: "literal" })),
  example,
  exampleTranslation,
  alternativeForms: [],
  conjugations: conjugationsFor(word),
  verbType: word.split(" ")[0] in IRREGULAR ? "irregular" : "regular",
  familyKey: word,
  usageStatus,
})

// Curated from the supplied PDF. The document is a source of candidates only;
// corrections are frozen here so opening the app never calls AI services.
export const VOCAB_DEFAULT_CATALOG: readonly VocabCatalogEntry[] = [
  e("pv-put-away", "put away", "guardar; pôr no lugar", "Guardar algo depois de usá-lo.", "Please put away the tools when you finish.", "Por favor, guarde as ferramentas quando terminar."),
  e("pv-lay-off", "lay off", "demitir; parar de incomodar", "Demitir funcionários, geralmente por motivos econômicos; informalmente, parar uma ação incômoda.", "The company had to lay off twenty workers.", "A empresa teve de demitir vinte funcionários."),
  e("pv-creep-in", "creep in", "entrar aos poucos; infiltrar-se", "Surgir ou entrar lenta e quase imperceptivelmente.", "A small error crept into the final report.", "Um pequeno erro se infiltrou no relatório final."),
  e("pv-cut-off", "cut off", "cortar; interromper; isolar", "Interromper um fornecimento, comunicação ou acesso.", "The storm cut off electricity to the village.", "A tempestade interrompeu a eletricidade da vila."),
  e("pv-wind-up", "wind up", "acabar; terminar", "Chegar inesperadamente a uma situação ou lugar.", "We wound up staying another night.", "Acabamos ficando mais uma noite."),
  e("pv-keep-up-with", "keep up with", "acompanhar; manter o ritmo", "Avançar no mesmo ritmo de alguém ou de algo.", "I read every day to keep up with the course.", "Leio todos os dias para acompanhar o curso."),
  e("pv-look-out", "look out", "cuidado; ficar atento", "Avisar alguém sobre um perigo imediato.", "Look out! There is ice on the stairs.", "Cuidado! Há gelo na escada."),
  e("pv-stick-out", "stick out", "destacar-se; sobressair", "Ser facilmente percebido ou projetar-se para fora.", "Her red coat made her stick out in the crowd.", "O casaco vermelho fez com que ela se destacasse na multidão."),
  e("pv-turn-over", "turn over", "virar; transferir", "Virar algo para o outro lado ou entregar controle a outra pessoa.", "Turn the page over and read the instructions.", "Vire a página e leia as instruções."),
  e("pv-figure-out", "figure out", "descobrir; entender; resolver", "Encontrar uma resposta por raciocínio.", "We need to figure out why the engine stopped.", "Precisamos descobrir por que o motor parou."),
  e("pv-pull-into", "pull into", "entrar; chegar", "Chegar a um local com um veículo.", "The train pulled into the station on time.", "O trem chegou à estação no horário."),
  e("pv-put-up-with", "put up with", "tolerar; aguentar", "Aceitar uma situação desagradável sem reclamar ou desistir.", "I cannot put up with that noise any longer.", "Não consigo mais aguentar esse barulho."),
  e("pv-pick-on", "pick on", "implicar com; perseguir", "Tratar alguém injustamente de modo repetido.", "Older students should not pick on younger ones.", "Alunos mais velhos não devem implicar com os mais novos."),
  e("pv-put-off", "put off", "adiar; desencorajar", "Transferir algo para mais tarde ou causar aversão.", "They put off the meeting until Friday.", "Eles adiaram a reunião até sexta-feira."),
  e("pv-go-over", "go over", "revisar; examinar", "Examinar algo cuidadosamente.", "Let us go over the safety checklist once more.", "Vamos revisar a lista de segurança mais uma vez."),
  e("pv-go-up", "go up", "subir; aumentar", "Mover-se para cima ou aumentar de valor.", "Fuel prices went up again this month.", "Os preços dos combustíveis subiram novamente este mês."),
  e("pv-keep-in", "keep in", "manter dentro; não deixar sair", "Impedir que alguém ou algo saia.", "The rain kept the children in all afternoon.", "A chuva manteve as crianças dentro de casa a tarde toda."),
  e("pv-call-out", "call out", "chamar; convocar; criticar publicamente", "Chamar em voz alta, convocar ajuda ou expor um comportamento errado.", "The hospital called out extra staff during the emergency.", "O hospital convocou funcionários extras durante a emergência."),
  e("pv-call-down", "call down", "repreender", "Repreender alguém; uso hoje pouco comum.", "The supervisor called him down for ignoring the rule.", "O supervisor o repreendeu por ignorar a regra.", "rare"),
  e("pv-get-out", "get out", "sair; escapar", "Deixar um lugar ou livrar-se de uma situação.", "Everyone got out of the building safely.", "Todos saíram do prédio em segurança."),
  e("pv-rack-up", "rack up", "acumular", "Acumular rapidamente pontos, custos, dívidas ou vitórias.", "The team racked up five wins in a row.", "A equipe acumulou cinco vitórias seguidas."),
  e("pv-blow-up", "blow up", "explodir; ampliar; perder a calma", "Explodir, ampliar uma imagem ou ficar subitamente zangado.", "The old boiler could blow up if it overheats.", "A caldeira antiga pode explodir se superaquecer."),
  e("pv-take-place", "take place", "acontecer; realizar-se", "Ocorrer em um momento ou lugar planejado.", "The ceremony will take place in June.", "A cerimônia acontecerá em junho."),
  e("pv-grow-up", "grow up", "crescer; amadurecer", "Passar da infância à vida adulta ou tornar-se mais maduro.", "She grew up near the coast.", "Ela cresceu perto do litoral."),
  e("pv-watch-out", "watch out", "tomar cuidado; ficar atento", "Permanecer atento a uma ameaça específica.", "Watch out for cyclists when you open the door.", "Fique atento aos ciclistas ao abrir a porta."),
  e("pv-turn-down", "turn down", "recusar; diminuir", "Recusar uma oferta ou reduzir volume, intensidade ou temperatura.", "He turned down the job offer.", "Ele recusou a oferta de emprego."),
  e("pv-turn-up", "turn up", "aparecer; aumentar", "Chegar inesperadamente ou aumentar volume, intensidade ou temperatura.", "Mia turned up half an hour late.", "Mia apareceu meia hora atrasada."),
  e("pv-turn-away", "turn away", "recusar entrada; afastar", "Impedir que alguém entre ou fazer alguém desviar o olhar.", "The venue turned away visitors without tickets.", "O local recusou a entrada de visitantes sem ingresso."),
  e("pv-turn-out", "turn out", "resultar; comparecer", "Ter um resultado inesperado ou comparecer a um evento.", "The repair turned out to be simple.", "O reparo acabou sendo simples."),
  e("pv-plow-into", "plow into", "colidir violentamente com", "Atingir algo com força, geralmente sem conseguir parar.", "The truck plowed into a roadside barrier.", "O caminhão colidiu violentamente com uma barreira à beira da estrada."),
  e("pv-put-forward", "put forward", "apresentar; propor", "Apresentar uma ideia, argumento ou candidato para consideração.", "The committee put forward a practical proposal.", "O comitê apresentou uma proposta prática."),
  e("pv-turn-in", "turn in", "entregar; ir dormir", "Entregar um trabalho ou objeto; informalmente, ir para a cama.", "Please turn in your assignment by noon.", "Por favor, entregue seu trabalho até o meio-dia."),
  e("pv-bring-about", "bring about", "provocar; causar", "Fazer com que uma mudança ou situação aconteça.", "The reforms brought about major improvements.", "As reformas provocaram grandes melhorias."),
  e("pv-take-after", "take after", "parecer-se com", "Assemelhar-se a um familiar em aparência ou personalidade.", "Lena takes after her mother.", "Lena se parece com a mãe."),
  e("pv-look-down-on", "look down on", "menosprezar", "Considerar alguém inferior.", "You should never look down on people for their accent.", "Você nunca deve menosprezar as pessoas por causa do sotaque."),
  e("pv-break-out", "break out", "começar repentinamente; escapar", "Começar de forma súbita, especialmente guerra, incêndio ou doença.", "A fire broke out on the second floor.", "Um incêndio começou no segundo andar."),
  e("pv-catch-up-on", "catch up on", "colocar em dia", "Fazer algo que ficou atrasado.", "I used the weekend to catch up on my reading.", "Usei o fim de semana para colocar minha leitura em dia."),
  e("pv-call-on", "call on", "visitar; pedir que alguém faça algo", "Visitar alguém brevemente ou escolher alguém para responder.", "We called on our neighbors after lunch.", "Visitamos nossos vizinhos depois do almoço."),
  e("pv-look-up", "look up", "procurar; melhorar", "Buscar uma informação ou, informalmente, começar a melhorar.", "Look up the word in a reliable dictionary.", "Procure a palavra em um dicionário confiável."),
  e("pv-pick-out", "pick out", "escolher; identificar", "Escolher ou reconhecer alguém ou algo em um grupo.", "She picked out a blue jacket.", "Ela escolheu uma jaqueta azul."),
  e("pv-wire-up", "wire up", "conectar eletricamente", "Conectar fios ou equipamentos para que funcionem.", "An electrician wired up the new alarm system.", "Um eletricista conectou o novo sistema de alarme."),
  e("pv-track-down", "track down", "rastrear; localizar", "Encontrar alguém ou algo depois de uma busca cuidadosa.", "The researcher tracked down the original document.", "A pesquisadora localizou o documento original."),
  e("pv-get-along", "get along", "dar-se bem; progredir", "Ter uma relação amigável ou avançar em uma tarefa.", "The new colleagues get along very well.", "Os novos colegas se dão muito bem."),
  e("pv-set-sail", "set sail", "zarpar", "Iniciar uma viagem de barco ou navio.", "The vessel set sail before sunrise.", "A embarcação zarpou antes do nascer do sol."),
  e("pv-take-apart", "take apart", "desmontar", "Separar algo em suas peças.", "The technician took the motor apart.", "O técnico desmontou o motor."),
  e("pv-come-up-with", "come up with", "ter; criar; propor", "Produzir uma ideia, plano ou resposta.", "Can you come up with a better solution?", "Você consegue propor uma solução melhor?"),
  e("pv-get-ahead", "get ahead", "progredir; prosperar", "Alcançar sucesso na carreira ou na vida.", "She studies at night to get ahead at work.", "Ela estuda à noite para progredir no trabalho."),
  e("pv-catch-up-with", "catch up with", "alcançar; conversar para se atualizar", "Chegar ao mesmo nível de alguém ou trocar novidades depois de um tempo.", "Run faster or you will not catch up with them.", "Corra mais rápido ou você não vai alcançá-los."),
  e("pv-come-across", "come across", "encontrar por acaso", "Encontrar alguém ou algo sem procurar.", "I came across an old photograph in the drawer.", "Encontrei por acaso uma fotografia antiga na gaveta."),
  e("pv-bounce-off", "bounce off", "ricochetear; testar uma ideia com alguém", "Bater em uma superfície e voltar; informalmente, compartilhar uma ideia para obter reação.", "The ball bounced off the wall.", "A bola ricocheteou na parede."),
  e("pv-live-up-to", "live up to", "corresponder a", "Atender a expectativas, promessas ou padrões.", "The film did not live up to the reviews.", "O filme não correspondeu às críticas."),
  e("pv-stand-up-to", "stand up to", "enfrentar; resistir a", "Recusar-se a aceitar intimidação ou resistir a condições difíceis.", "She stood up to the bully.", "Ela enfrentou o agressor."),
  e("pv-stand-up-for", "stand up for", "defender", "Defender uma pessoa, ideia ou direito.", "We must stand up for equal treatment.", "Precisamos defender o tratamento igualitário."),
  e("pv-stand-in-for", "stand in for", "substituir temporariamente", "Assumir temporariamente o lugar ou função de outra pessoa.", "Could you stand in for me on Monday?", "Você poderia me substituir na segunda-feira?"),
  e("pv-give-in", "give in", "ceder; render-se", "Parar de resistir a alguém ou a uma pressão.", "After hours of debate, he finally gave in.", "Depois de horas de debate, ele finalmente cedeu."),
  e("pv-cut-down-on", "cut down on", "reduzir", "Consumir ou fazer menos de algo.", "I am trying to cut down on sugar.", "Estou tentando reduzir o açúcar."),
  e("pv-ship-off", "ship off", "enviar; mandar embora", "Enviar alguém ou algo para outro lugar, muitas vezes distante.", "The equipment was shipped off for repairs.", "O equipamento foi enviado para reparos."),
  e("pv-carry-out", "carry out", "realizar; executar", "Completar uma tarefa, plano, pesquisa ou ordem.", "The team carried out a detailed inspection.", "A equipe realizou uma inspeção detalhada."),
  e("pv-run-out-of", "run out of", "ficar sem; esgotar", "Usar todo o estoque de algo.", "We ran out of clean water.", "Ficamos sem água potável."),
  e("pv-fill-up", "fill up", "encher; completar", "Encher completamente um recipiente ou tanque.", "We stopped to fill up the fuel tank.", "Paramos para encher o tanque de combustível."),
  e("pv-get-by", "get by", "sobreviver; conseguir se virar", "Administrar uma situação com recursos ou conhecimento apenas suficientes.", "They can get by on a very small income.", "Eles conseguem se virar com uma renda muito pequena."),
  e("pv-run-over", "run over", "atropelar; ultrapassar o tempo", "Atingir alguém com um veículo ou exceder o tempo previsto.", "The meeting ran over by twenty minutes.", "A reunião ultrapassou o horário em vinte minutos."),
  e("pv-knock-down", "knock down", "derrubar; reduzir", "Fazer alguém ou algo cair; também reduzir um preço.", "The strong wind knocked down several trees.", "O vento forte derrubou várias árvores."),
  e("pv-keep-away", "keep away", "manter afastado", "Impedir aproximação ou permanecer longe.", "Keep away from the edge of the platform.", "Mantenha-se afastado da borda da plataforma."),
  e("pv-lay-away", "lay away", "reservar para comprar depois", "Reservar um produto pagando-o em parcelas antes de levá-lo.", "They laid away the furniture until the move.", "Eles reservaram os móveis até a mudança."),
  e("pv-put-about", "put about", "mudar de rumo", "Em contexto náutico, fazer uma embarcação mudar de direção.", "The captain ordered the boat to put about.", "O capitão ordenou que o barco mudasse de rumo.", "rare"),
  e("pv-put-across", "put across", "comunicar claramente", "Expressar uma ideia de modo que seja entendida.", "She put her argument across clearly.", "Ela comunicou seu argumento com clareza."),
  e("pv-run-aground", "run aground", "encalhar", "Ficar preso no fundo ou na margem em águas rasas.", "The fishing boat ran aground near the harbor.", "O barco de pesca encalhou perto do porto."),
  e("pv-take-on-water", "take on water", "começar a inundar; fazer água", "Permitir que água entre em uma embarcação.", "The damaged vessel began to take on water.", "A embarcação danificada começou a fazer água."),
  e("pv-cast-off", "cast off", "desatracar; soltar as amarras", "Soltar as cordas para iniciar uma viagem de barco.", "The crew cast off at dawn.", "A tripulação soltou as amarras ao amanhecer."),
  e("pv-cut-out", "cut out", "eliminar; parar de funcionar; recortar", "Remover algo de um hábito; também parar subitamente de funcionar.", "The doctor advised him to cut out fried food.", "O médico o aconselhou a eliminar frituras."),
  e("pv-take-up", "take up", "começar; ocupar", "Começar uma atividade ou usar espaço/tempo.", "She took up sailing last summer.", "Ela começou a praticar vela no verão passado."),
  e("pv-walk-out", "walk out", "ir embora em protesto", "Sair repentinamente, muitas vezes para demonstrar desagrado.", "Several employees walked out of the meeting.", "Vários funcionários saíram da reunião em protesto."),
  e("pv-look-into", "look into", "investigar", "Examinar um problema ou alegação cuidadosamente.", "The agency will look into the complaint.", "A agência investigará a reclamação."),
  e("pv-wear-off", "wear off", "perder o efeito; passar", "Diminuir gradualmente até desaparecer.", "The painkiller should wear off by evening.", "O efeito do analgésico deve passar até a noite."),
  e("pv-take-over", "take over", "assumir o controle", "Obter controle ou responsabilidade por algo.", "A new manager will take over next week.", "Um novo gerente assumirá na próxima semana."),
  e("pv-push-back", "push back", "adiar; resistir", "Mudar algo para uma data posterior ou resistir a uma proposta.", "They pushed back the launch by two weeks.", "Eles adiaram o lançamento em duas semanas."),
  e("pv-go-down", "go down", "cair; diminuir; acontecer", "Mover-se para baixo, diminuir ou ser registrado na história.", "Temperatures will go down overnight.", "As temperaturas cairão durante a noite."),
  e("pv-run-into", "run into", "encontrar por acaso; colidir com", "Encontrar alguém inesperadamente ou bater em algo.", "I ran into an old friend at the station.", "Encontrei por acaso um velho amigo na estação."),
  e("pv-get-over", "get over", "superar; recuperar-se", "Recuperar-se de uma doença ou superar uma dificuldade.", "It took her weeks to get over the flu.", "Ela levou semanas para se recuperar da gripe."),
  e("pv-stay-up", "stay up", "ficar acordado", "Não ir dormir até tarde.", "We stayed up to watch the final.", "Ficamos acordados para assistir à final."),
  e("pv-switch-on", "switch on", "ligar", "Ligar um aparelho usando um interruptor ou controle.", "Switch on the navigation lights before departure.", "Ligue as luzes de navegação antes da partida."),
  e("pv-eat-out", "eat out", "comer fora", "Fazer uma refeição em restaurante ou fora de casa.", "We eat out once a week.", "Comemos fora uma vez por semana."),
  e("pv-write-down", "write down", "anotar", "Registrar uma informação por escrito.", "Write down the address before you leave.", "Anote o endereço antes de sair."),
  e("pv-set-off", "set off", "partir; iniciar uma viagem", "Iniciar uma viagem ou fazer algo começar subitamente.", "The research vessel set off before sunrise.", "A embarcação de pesquisa partiu antes do nascer do sol."),
  e("pv-look-for", "look for", "procurar; buscar", "Tentar encontrar alguém ou alguma coisa.", "The crew looked for signs of a leak.", "A tripulação procurou sinais de vazamento."),
  e("pv-look-out-for", "look out for", "ficar atento a; vigiar", "Observar com atenção para perceber um risco ou uma oportunidade.", "Look out for floating debris near the channel.", "Fique atento a destroços flutuantes perto do canal."),
  e("pv-pick-up", "pick up", "pegar; buscar", "Levantar, coletar ou buscar alguém ou algo.", "The launch will pick up the technicians at noon.", "A lancha buscará os técnicos ao meio-dia."),
  e("pv-start-off", "start off", "começar; partir", "Começar uma atividade, processo ou viagem de determinada maneira.", "We started off with a short safety briefing.", "Começamos com uma breve instrução de segurança."),
  e("pv-cope-with", "cope with", "lidar com; enfrentar", "Administrar com sucesso uma situação difícil.", "The emergency team coped with the sudden failure.", "A equipe de emergência lidou com a falha repentina."),
  e("pv-break-off", "break off", "interromper; romper", "Encerrar algo abruptamente ou separar uma parte.", "The two sides broke off the negotiations.", "Os dois lados interromperam as negociações."),
  e("pv-end-up", "end up", "acabar; terminar", "Chegar a uma situação ou lugar, muitas vezes sem planejamento.", "We ended up changing the entire route.", "Acabamos mudando toda a rota."),
  e("pv-bring-up", "bring up", "mencionar; criar", "Introduzir um assunto ou criar uma criança.", "She brought up the maintenance issue at the meeting.", "Ela mencionou o problema de manutenção na reunião."),
  e("pv-look-forward-to", "look forward to", "aguardar com expectativa; estar ansioso por", "Sentir satisfação ao pensar em um acontecimento futuro.", "We look forward to welcoming the new cadets.", "Aguardamos com expectativa a chegada dos novos cadetes."),
  e("pv-stand-out", "stand out", "destacar-se; sobressair", "Ser facilmente notado por ser diferente ou melhor.", "Her calm response made her stand out from the group.", "A resposta calma fez com que ela se destacasse do grupo."),
  e("pv-get-away-with", "get away with", "sair impune; escapar de punição", "Fazer algo errado sem sofrer punição.", "No one should get away with falsifying a report.", "Ninguém deveria sair impune por falsificar um relatório."),
  e("pv-split-up", "split up", "separar-se; dividir", "Separar pessoas, grupos ou partes.", "The inspection team split up to cover both decks.", "A equipe de inspeção se dividiu para cobrir os dois conveses."),
  e("pv-go-off", "go off", "disparar; soar", "Explodir, disparar ou começar a emitir um som.", "The alarm went off during the night watch.", "O alarme disparou durante o quarto noturno."),
  e("pv-pull-away", "pull away", "afastar-se; ganhar vantagem", "Mover-se para longe ou começar a avançar à frente.", "The tug pulled away from the pier slowly.", "O rebocador se afastou lentamente do píer."),
  e("pv-pull-in", "pull in", "chegar; encostar", "Chegar com um veículo ou embarcação; também atrair pessoas.", "The ferry pulled in ten minutes late.", "A balsa chegou com dez minutos de atraso."),
  e("pv-pull-off", "pull off", "conseguir; realizar", "Realizar com sucesso algo difícil.", "The crew pulled off a difficult rescue.", "A tripulação conseguiu realizar um resgate difícil."),
  e("pv-pull-over", "pull over", "encostar; parar no acostamento", "Mover um veículo para o lado e parar.", "The officer asked the driver to pull over.", "O policial pediu ao motorista que encostasse."),
  e("pv-break-down", "break down", "quebrar; decompor-se", "Parar de funcionar ou ser dividido em partes menores.", "The auxiliary generator broke down at sea.", "O gerador auxiliar quebrou no mar."),
  e("pv-put-out", "put out", "apagar; extinguir", "Fazer um fogo ou uma chama parar de queimar.", "The crew put out the fire within minutes.", "A tripulação apagou o incêndio em poucos minutos."),
  e("pv-stem-from", "stem from", "originar-se de; decorrer de", "Ter determinada situação como origem ou causa.", "The delay stemmed from a faulty valve.", "O atraso decorreu de uma válvula defeituosa."),
  e("pv-carry-on", "carry on", "continuar; prosseguir", "Continuar fazendo algo apesar de uma interrupção ou dificuldade.", "The captain told us to carry on with the inspection.", "O capitão nos disse para prosseguir com a inspeção."),
  e("pv-carry-away", "carry away", "levar; deixar-se levar", "Transportar algo ou fazer alguém perder o autocontrole pela emoção.", "Do not get carried away by early success.", "Não se deixe levar pelo sucesso inicial."),
  e("pv-bump-off", "bump off", "assassinar; matar", "Gíria informal para matar alguém deliberadamente.", "The novel's villain planned to bump off a witness.", "O vilão do romance planejava assassinar uma testemunha."),
  e("pv-come-over", "come over", "vir visitar; passar em casa", "Ir à casa ou ao local onde outra pessoa está.", "Come over after work and we can review the plan.", "Passe aqui depois do trabalho e poderemos revisar o plano."),
  e("pv-keep-down", "keep down", "reprimir; manter baixo", "Impedir crescimento, movimento ou expressão; também manter algo em nível baixo.", "The new insulation keeps the engine noise down.", "O novo isolamento mantém baixo o ruído do motor."),
  e("pv-fade-away", "fade away", "desaparecer gradualmente; diminuir", "Tornar-se gradualmente mais fraco até desaparecer.", "The lighthouse faded away in the fog.", "O farol desapareceu gradualmente na neblina."),
  e("pv-count-on", "count on", "contar com; confiar em", "Confiar que alguém fará algo ou que algo acontecerá.", "You can count on the watch team in an emergency.", "Você pode contar com a equipe de quarto em uma emergência."),
  e("pv-take-out", "take out", "retirar; remover", "Remover algo de um lugar ou levar alguém para uma atividade social.", "The mechanic took out the damaged filter.", "O mecânico retirou o filtro danificado."),
  e("pv-clean-up", "clean up", "limpar; arrumar", "Deixar um lugar limpo e organizado.", "Please clean up the workshop after the repair.", "Por favor, limpe a oficina depois do reparo."),
  e("pv-give-up", "give up", "desistir; abandonar", "Parar de tentar ou deixar definitivamente uma atividade.", "The rescue team refused to give up the search.", "A equipe de resgate se recusou a desistir da busca."),
  e("pv-go-on", "go on", "continuar; prosseguir", "Continuar acontecendo ou continuar uma atividade.", "The training went on despite the rain.", "O treinamento continuou apesar da chuva."),
  e("pv-give-away", "give away", "doar; revelar", "Entregar algo gratuitamente ou revelar informação involuntariamente.", "His expression gave away the answer.", "A expressão dele revelou a resposta."),
  e("pv-deal-with", "deal with", "lidar com; tratar de", "Tomar medidas para resolver uma situação ou tratar de um assunto.", "The report deals with safety at sea.", "O relatório trata da segurança no mar."),
  e("pv-throw-away", "throw away", "jogar fora; descartar", "Descartar algo que não é mais necessário.", "Do not throw away reusable materials.", "Não jogue fora materiais reutilizáveis."),
  e("pv-hang-around", "hang around", "ficar por perto; ficar à toa", "Permanecer em um lugar sem uma finalidade definida.", "Several passengers hung around near the gate.", "Vários passageiros ficaram por perto do portão."),
  e("pv-run-through", "run through", "revisar; ensaiar", "Examinar ou praticar algo rapidamente do começo ao fim.", "Let us run through the evacuation procedure once more.", "Vamos revisar o procedimento de evacuação mais uma vez."),
  e("pv-hang-out", "hang out", "passar tempo; conviver", "Passar tempo relaxando ou socializando em determinado lugar.", "The cadets hang out in the common room after class.", "Os cadetes passam tempo na sala comum depois da aula."),
]

const catalogOwnedFields = (entry: VocabCatalogEntry | Flashcard) => ({
  word: entry.word,
  partOfSpeech: entry.partOfSpeech,
  translation: entry.translation,
  ipa: entry.ipa ?? "",
  usageNote: entry.usageNote ?? "",
  usageNoteEn: entry.usageNoteEn ?? "",
  synonyms: entry.synonyms,
  antonyms: entry.antonyms,
  example: entry.example,
  exampleTranslation: entry.exampleTranslation ?? "",
  alternativeForms: entry.alternativeForms,
  conjugations: entry.conjugations ?? null,
  verbType: entry.verbType ?? null,
  familyKey: entry.familyKey ?? "",
  usageStatus: entry.usageStatus ?? "current",
})

function hashValue(value: unknown): string {
  const source = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function vocabCatalogContentHash(entry: VocabCatalogEntry | Flashcard): string {
  return hashValue(catalogOwnedFields(entry))
}

/** Compatibility hash for catalog v1, before full learner metadata was added. */
export function vocabCatalogLegacyContentHash(entry: VocabCatalogEntry | Flashcard): string {
  return hashValue({
    word: entry.word,
    partOfSpeech: entry.partOfSpeech,
    translation: entry.translation,
    usageNote: entry.usageNote ?? "",
    usageNoteEn: entry.usageNoteEn ?? "",
    synonyms: entry.synonyms,
    antonyms: entry.antonyms,
    example: entry.example,
    exampleTranslation: entry.exampleTranslation ?? "",
    alternativeForms: entry.alternativeForms,
    familyKey: entry.familyKey ?? "",
    usageStatus: entry.usageStatus ?? "current",
  })
}

export function validateVocabDefaultCatalog(): void {
  const ids = new Set<string>()
  const words = new Set<string>()
  for (const entry of VOCAB_DEFAULT_CATALOG) {
    if (!entry.catalogId || ids.has(entry.catalogId)) throw new Error(`Invalid or duplicate Vocab catalog id: ${entry.catalogId}`)
    ids.add(entry.catalogId)
    const wordKey = `${entry.word.trim().toLowerCase()}__${entry.partOfSpeech}`
    if (!entry.word.trim() || words.has(wordKey)) throw new Error(`Invalid or duplicate Vocab catalog word: ${entry.word}`)
    words.add(wordKey)
    if (!entry.translation.trim() || !entry.example.trim() || !entry.exampleTranslation?.trim()) {
      throw new Error(`Incomplete Vocab catalog entry: ${entry.catalogId}`)
    }
    if (!entry.translation.includes("/") && entry.translation.split(/[,;]/).length > 1) {
      throw new Error(`Unnormalized translations in Vocab catalog entry: ${entry.catalogId}`)
    }
    if (!entry.ipa?.trim() || !entry.conjugations || !entry.verbType || entry.synonyms.length === 0) {
      throw new Error(`Missing learner metadata in Vocab catalog entry: ${entry.catalogId}`)
    }
    if (entry.usageNote || entry.usageNoteEn) {
      throw new Error(`Phrasal verb context must be empty: ${entry.catalogId}`)
    }
    if (entry.partOfSpeech !== "phrasal-verb" || !Array.isArray(entry.synonyms) || !Array.isArray(entry.antonyms) || !Array.isArray(entry.alternativeForms)) {
      throw new Error(`Structurally invalid Vocab catalog entry: ${entry.catalogId}`)
    }
  }
}
