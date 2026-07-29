import type { Flashcard, PartOfSpeech } from "@/lib/types"

export const VOCAB_IDIOMS_CATALOG_VERSION = 3
export const VOCAB_IDIOMS_FOLDER_NAME = "Idioms Essentials"
export const VOCAB_IDIOMS_FOLDER_COLOR = "default"

export type VocabIdiomsCatalogEntry = Omit<Flashcard, "id" | "folderId" | "createdAt" | "audioSrc" | "catalogContentHash">

type SourceEntry = {
  id: string
  word: string
  translation: string
  ipa: string
  meaningPt: string
  meaningEn: string
  example: string
  examplePt: string
  synonyms?: string[]
  antonyms?: string[]
  partOfSpeech?: PartOfSpeech
  literalTrap?: string
}

const source: SourceEntry[] = [
  { id: "take-for-granted", word: "take for granted", translation: "não dar o devido valor / considerar garantido", ipa: "teɪk fər ˈɡræntɪd", meaningPt: "Usado quando algo é pouco valorizado porque parece certo ou sempre disponível.", meaningEn: "Used when something is undervalued because it seems certain or always available.", example: "We often take clean water for granted.", examplePt: "Muitas vezes não damos o devido valor à água limpa.", synonyms: ["assume", "undervalue"], antonyms: ["appreciate"] },
  { id: "by-no-means", word: "by no means", translation: "de jeito nenhum / de forma alguma", ipa: "baɪ noʊ miːnz", meaningPt: "Expressa uma negação enfática; no início da oração, normalmente exige inversão.", meaningEn: "Expresses emphatic negation; clause-initial use normally requires inversion.", example: "By no means is this an easy decision.", examplePt: "Esta não é, de forma alguma, uma decisão fácil.", synonyms: ["not at all", "in no way"] },
  { id: "take-its-toll-on", word: "take its toll on", translation: "cobrar seu preço / causar desgaste", ipa: "teɪk ɪts toʊl ɑːn", meaningPt: "Indica dano ou desgaste acumulado ao longo do tempo.", meaningEn: "Describes damage or strain that accumulates over time.", example: "Months of stress took their toll on her health.", examplePt: "Meses de estresse cobraram seu preço na saúde dela.", synonyms: ["wear down", "damage"] },
  { id: "by-and-large", word: "by and large", translation: "de modo geral / no geral", ipa: "baɪ ən lɑːrdʒ", meaningPt: "Introduz uma avaliação geral, admitindo possíveis exceções.", meaningEn: "Introduces a general assessment while allowing for exceptions.", example: "By and large, the new procedure works well.", examplePt: "De modo geral, o novo procedimento funciona bem.", synonyms: ["generally", "mostly"] },
  { id: "rule-out", word: "rule out", translation: "descartar / eliminar uma possibilidade", ipa: "ruːl aʊt", meaningPt: "Usado para concluir que uma hipótese ou opção não é possível.", meaningEn: "Used to conclude that a possibility or option is not viable.", example: "The tests ruled out a mechanical failure.", examplePt: "Os testes descartaram uma falha mecânica.", synonyms: ["exclude", "eliminate"], antonyms: ["consider"], partOfSpeech: "phrasal-verb" },
  { id: "learn-the-ropes", word: "learn the ropes", translation: "aprender as manhas / entender como funciona", ipa: "lɜːrn ðə roʊps", meaningPt: "Significa aprender os procedimentos básicos de uma atividade ou trabalho.", meaningEn: "Means learning the basic procedures of an activity or job.", example: "It took me a week to learn the ropes at the new office.", examplePt: "Levei uma semana para aprender como tudo funcionava no novo escritório.", synonyms: ["get the hang of it"] },
  { id: "weather-the-storm", word: "weather the storm", translation: "superar uma grande crise / resistir à adversidade", ipa: "ˈwɛðər ðə stɔːrm", meaningPt: "Refere-se a sobreviver a um período difícil sem ser derrotado.", meaningEn: "Refers to surviving a difficult period without being defeated.", example: "The small company managed to weather the storm.", examplePt: "A pequena empresa conseguiu superar a crise.", synonyms: ["pull through", "survive"] },
  { id: "miss-the-boat", word: "miss the boat", translation: "perder a oportunidade / deixar passar a chance", ipa: "mɪs ðə boʊt", meaningPt: "Usado quando alguém age tarde demais e perde uma oportunidade.", meaningEn: "Used when someone acts too late and loses an opportunity.", example: "Apply today or you may miss the boat.", examplePt: "Inscreva-se hoje ou você poderá perder a oportunidade.", antonyms: ["seize the opportunity"] },
  { id: "in-the-same-boat", word: "be in the same boat", translation: "estar na mesma situação / enfrentar o mesmo problema", ipa: "bi ɪn ðə seɪm boʊt", meaningPt: "Indica que duas ou mais pessoas compartilham a mesma dificuldade.", meaningEn: "Indicates that two or more people share the same difficulty.", example: "We are all in the same boat, so let us cooperate.", examplePt: "Estamos todos na mesma situação, então vamos cooperar.", synonyms: ["share the same predicament"] },
  { id: "out-of-the-blue", word: "out of the blue", translation: "do nada / de repente", ipa: "aʊt əv ðə bluː", meaningPt: "Descreve algo totalmente inesperado.", meaningEn: "Describes something completely unexpected.", example: "She called me out of the blue after ten years.", examplePt: "Ela me ligou do nada depois de dez anos.", synonyms: ["unexpectedly", "suddenly"] },
  { id: "bite-the-bullet", word: "bite the bullet", translation: "encarar a situação / aceitar algo difícil", ipa: "baɪt ðə ˈbʊlɪt", meaningPt: "Usado quando alguém decide enfrentar algo desagradável ou inevitável.", meaningEn: "Used when someone decides to face something unpleasant or unavoidable.", example: "I finally bit the bullet and had the difficult conversation.", examplePt: "Finalmente encarei a situação e tive a conversa difícil.", synonyms: ["face the music"] },
  { id: "hit-the-nail-on-the-head", word: "hit the nail on the head", translation: "acertar na mosca / identificar exatamente o ponto", ipa: "hɪt ðə neɪl ɑːn ðə hɛd", meaningPt: "Significa dizer ou identificar exatamente o que está correto.", meaningEn: "Means saying or identifying exactly what is correct.", example: "Your analysis hit the nail on the head.", examplePt: "Sua análise acertou exatamente o ponto.", synonyms: ["be exactly right"] },
  { id: "beat-around-the-bush", word: "beat around the bush", translation: "fazer rodeios / evitar o assunto", ipa: "biːt əˈraʊnd ðə bʊʃ", meaningPt: "Usado quando alguém evita falar diretamente sobre o ponto principal.", meaningEn: "Used when someone avoids speaking directly about the main point.", example: "Stop beating around the bush and tell me what happened.", examplePt: "Pare de fazer rodeios e diga o que aconteceu.", antonyms: ["get to the point"] },
  { id: "be-bound-to", word: "be bound to", translation: "estar fadado a / ser muito provável", ipa: "bi baʊnd tuː", meaningPt: "Expressa uma expectativa forte de que algo acontecerá.", meaningEn: "Expresses a strong expectation that something will happen.", example: "There is bound to be some resistance to the change.", examplePt: "É muito provável que haja alguma resistência à mudança.", synonyms: ["be certain to", "be likely to"] },
  { id: "pull-someones-leg", word: "pull someone's leg", translation: "tirar sarro de alguém / brincar com alguém", ipa: "pʊl ˈsʌmwʌnz lɛɡ", meaningPt: "Significa enganar alguém de brincadeira, sem intenção séria.", meaningEn: "Means teasing or jokingly deceiving someone without serious intent.", example: "Relax, I was only pulling your leg.", examplePt: "Relaxe, eu só estava brincando com você.", synonyms: ["tease", "kid"], literalTrap: "Não significa literalmente puxar a perna de alguém." },
  { id: "call-it-a-day", word: "call it a day", translation: "encerrar por hoje / parar de trabalhar", ipa: "kɔːl ɪt ə deɪ", meaningPt: "Usado para decidir que o trabalho ou atividade terminou naquele dia.", meaningEn: "Used to decide that work or an activity is finished for the day.", example: "We have done enough; let us call it a day.", examplePt: "Já fizemos o suficiente; vamos encerrar por hoje.", synonyms: ["finish for the day"], literalTrap: "Não significa literalmente chamar algo de dia." },
  { id: "hit-the-books", word: "hit the books", translation: "estudar intensamente / começar a estudar", ipa: "hɪt ðə bʊks", meaningPt: "Expressão informal para começar a estudar com dedicação.", meaningEn: "An informal expression for beginning to study seriously.", example: "The exam is tomorrow, so I need to hit the books.", examplePt: "A prova é amanhã, então preciso estudar intensamente.", synonyms: ["study hard"], literalTrap: "Não significa literalmente bater nos livros." },
  { id: "under-the-weather", word: "under the weather", translation: "sentir-se mal / estar indisposto", ipa: "ˈʌndər ðə ˈwɛðər", meaningPt: "Indica que alguém está levemente doente ou indisposto.", meaningEn: "Indicates that someone feels slightly ill or unwell.", example: "I am feeling under the weather today.", examplePt: "Estou me sentindo indisposto hoje.", synonyms: ["unwell"], literalTrap: "Não significa literalmente estar debaixo do clima." },
  { id: "out-of-the-question", word: "out of the question", translation: "fora de cogitação / totalmente impossível", ipa: "aʊt əv ðə ˈkwɛstʃən", meaningPt: "Usado para afirmar que algo não pode ser considerado ou permitido.", meaningEn: "Used to state that something cannot be considered or allowed.", example: "Sailing in this weather is out of the question.", examplePt: "Navegar neste tempo está fora de cogitação.", synonyms: ["impossible"], literalTrap: "Não significa apenas estar fora de uma pergunta; indica impossibilidade." },
  { id: "tie-oneself-up-in-knots", word: "tie oneself up in knots", translation: "ficar muito confuso / complicar-se", ipa: "taɪ wʌnˈsɛlf ʌp ɪn nɑːts", meaningPt: "Descreve alguém que fica confuso ou ansioso ao pensar demais em um problema.", meaningEn: "Describes becoming confused or anxious by overthinking a problem.", example: "Do not tie yourself up in knots over a minor mistake.", examplePt: "Não fique tão confuso por causa de um erro pequeno.", synonyms: ["get confused"] },
  { id: "knuckle-down", word: "knuckle down", translation: "dedicar-se seriamente / começar a trabalhar duro", ipa: "ˈnʌkəl daʊn", meaningPt: "Significa começar a trabalhar ou estudar com esforço e disciplina.", meaningEn: "Means beginning to work or study with effort and discipline.", example: "We need to knuckle down and finish the report.", examplePt: "Precisamos nos dedicar seriamente e terminar o relatório.", synonyms: ["get down to work"], partOfSpeech: "phrasal-verb" },
  { id: "break-the-mold", word: "break the mold", translation: "romper com o padrão / inovar", ipa: "breɪk ðə moʊld", meaningPt: "Indica fazer algo de maneira nova, diferente das convenções.", meaningEn: "Indicates doing something in a new way that challenges convention.", example: "The designer broke the mold with a radically simple product.", examplePt: "O designer rompeu com o padrão com um produto radicalmente simples.", synonyms: ["innovate"] },
  { id: "burn-the-midnight-oil", word: "burn the midnight oil", translation: "trabalhar até tarde / estudar de madrugada", ipa: "bɜːrn ðə ˈmɪdnaɪt ɔɪl", meaningPt: "Significa trabalhar ou estudar até muito tarde da noite.", meaningEn: "Means working or studying very late into the night.", example: "She burned the midnight oil to complete the project.", examplePt: "Ela trabalhou até tarde para concluir o projeto.", synonyms: ["work late"] },
  { id: "leave-no-stone-unturned", word: "leave no stone unturned", translation: "fazer todo esforço possível / investigar tudo", ipa: "liːv noʊ stoʊn ʌnˈtɜːrnd", meaningPt: "Expressa a intenção de tentar todas as possibilidades para alcançar um objetivo.", meaningEn: "Expresses trying every possible option to achieve a goal.", example: "The investigators left no stone unturned.", examplePt: "Os investigadores fizeram todo esforço possível.", synonyms: ["search thoroughly"] },
  { id: "bark-up-the-wrong-tree", word: "bark up the wrong tree", translation: "culpar a pessoa errada / seguir uma pista equivocada", ipa: "bɑːrk ʌp ðə rɔːŋ triː", meaningPt: "Usado quando alguém acusa a pessoa errada ou segue uma suposição incorreta.", meaningEn: "Used when someone blames the wrong person or follows a mistaken assumption.", example: "If you suspect Marta, you are barking up the wrong tree.", examplePt: "Se você suspeita da Marta, está seguindo a pista errada.", synonyms: ["be mistaken"] },
  { id: "pull-oneself-together", word: "pull oneself together", translation: "acalmar-se / recuperar o controle", ipa: "pʊl wʌnˈsɛlf təˈɡɛðər", meaningPt: "Significa controlar as emoções e voltar a agir com calma.", meaningEn: "Means controlling one's emotions and acting calmly again.", example: "Take a moment to pull yourself together before the meeting.", examplePt: "Reserve um momento para se acalmar antes da reunião.", synonyms: ["compose oneself"] },
  { id: "let-the-cat-out-of-the-bag", word: "let the cat out of the bag", translation: "revelar um segredo / contar sem querer", ipa: "lɛt ðə kæt aʊt əv ðə bæɡ", meaningPt: "Significa revelar acidentalmente uma informação que deveria permanecer secreta.", meaningEn: "Means accidentally revealing information that should remain secret.", example: "He let the cat out of the bag about the surprise party.", examplePt: "Ele revelou sem querer o segredo da festa surpresa.", synonyms: ["spill the beans"] },
  { id: "smell-a-rat", word: "smell a rat", translation: "suspeitar de algo / perceber algo errado", ipa: "smɛl ə ræt", meaningPt: "Usado quando alguém desconfia que há fraude ou algo oculto.", meaningEn: "Used when someone suspects deception or something hidden.", example: "I smelled a rat when the figures did not match.", examplePt: "Suspeitei de algo quando os números não coincidiram.", synonyms: ["be suspicious"] },
  { id: "take-with-a-grain-of-salt", word: "take with a grain of salt", translation: "não acreditar completamente / considerar com cautela", ipa: "teɪk wɪð ə ɡreɪn əv sɔːlt", meaningPt: "Indica que uma informação deve ser recebida com ceticismo.", meaningEn: "Indicates that information should be received with skepticism.", example: "Take online rumors with a grain of salt.", examplePt: "Considere rumores da internet com cautela.", synonyms: ["treat skeptically"] },
  { id: "back-to-the-drawing-board", word: "go back to the drawing board", translation: "voltar à estaca zero / recomeçar o planejamento", ipa: "ɡoʊ bæk tə ðə ˈdrɔːɪŋ bɔːrd", meaningPt: "Usado quando uma tentativa falha e é necessário criar um novo plano.", meaningEn: "Used when an attempt fails and a new plan is required.", example: "The prototype failed, so we went back to the drawing board.", examplePt: "O protótipo falhou, então voltamos à estaca zero.", synonyms: ["start over"] },
  { id: "hit-the-ground-running", word: "hit the ground running", translation: "começar com força total / começar em ritmo acelerado", ipa: "hɪt ðə ɡraʊnd ˈrʌnɪŋ", meaningPt: "Significa iniciar uma atividade imediatamente com energia e eficiência.", meaningEn: "Means starting an activity immediately with energy and efficiency.", example: "The new manager hit the ground running.", examplePt: "A nova gerente começou com força total.", synonyms: ["start strongly"] },
  { id: "stem-the-tide", word: "stem the tide", translation: "conter o avanço / frear uma tendência", ipa: "stɛm ðə taɪd", meaningPt: "Significa tentar impedir que uma tendência negativa continue crescendo.", meaningEn: "Means trying to stop a negative trend from continuing to grow.", example: "New measures were introduced to stem the tide of pollution.", examplePt: "Novas medidas foram introduzidas para conter o avanço da poluição.", synonyms: ["hold back", "curb"] },
  { id: "plain-sailing", word: "plain sailing", translation: "muito fácil / sem dificuldades", ipa: "pleɪn ˈseɪlɪŋ", meaningPt: "Descreve uma situação que progride facilmente, sem problemas.", meaningEn: "Describes a situation that progresses easily and without problems.", example: "After the repairs, the rest of the voyage was plain sailing.", examplePt: "Depois dos reparos, o restante da viagem ocorreu sem dificuldades.", synonyms: ["smooth sailing"] },
  { id: "in-a-fix", word: "be in a fix", translation: "estar em apuros / estar numa situação difícil", ipa: "bi ɪn ə fɪks", meaningPt: "Indica estar diante de um problema difícil de resolver.", meaningEn: "Indicates being faced with a difficult problem.", example: "We are in a fix because the engine will not start.", examplePt: "Estamos em apuros porque o motor não liga.", synonyms: ["be in trouble"] },
  { id: "sticky-patch", word: "go through a sticky patch", translation: "passar por uma fase difícil / enfrentar dificuldades", ipa: "ɡoʊ θruː ə ˈstɪki pætʃ", meaningPt: "Descreve um período temporário de problemas ou dificuldades.", meaningEn: "Describes a temporary period of problems or difficulty.", example: "The team is going through a sticky patch.", examplePt: "A equipe está passando por uma fase difícil.", synonyms: ["have a rough time"] },
  { id: "razors-edge", word: "be on a razor's edge", translation: "estar por um fio / estar em situação crítica", ipa: "bi ɑːn ə ˈreɪzərz ɛdʒ", meaningPt: "Indica uma situação extremamente incerta ou perigosa.", meaningEn: "Indicates an extremely uncertain or dangerous situation.", example: "The negotiations are on a razor's edge.", examplePt: "As negociações estão por um fio.", synonyms: ["hang in the balance"] },
  { id: "paint-the-town-red", word: "paint the town red", translation: "cair na farra / sair para comemorar", ipa: "peɪnt ðə taʊn rɛd", meaningPt: "Significa sair para celebrar de maneira animada.", meaningEn: "Means going out to celebrate in a lively way.", example: "After the final exam, they painted the town red.", examplePt: "Depois da prova final, eles saíram para comemorar.", synonyms: ["celebrate wildly"] },
  { id: "give-it-a-miss", word: "give it a miss", translation: "deixar de fazer / não comparecer", ipa: "ɡɪv ɪt ə mɪs", meaningPt: "Expressão britânica para decidir não participar ou não fazer algo.", meaningEn: "A British expression for deciding not to attend or do something.", example: "I am tired, so I will give the party a miss.", examplePt: "Estou cansado, então não vou à festa.", synonyms: ["skip"] },
  { id: "without-missing-a-beat", word: "without missing a beat", translation: "sem hesitar / sem interromper o ritmo", ipa: "wɪˈðaʊt ˈmɪsɪŋ ə biːt", meaningPt: "Indica reagir imediatamente, com naturalidade e sem demonstrar surpresa.", meaningEn: "Indicates responding immediately and smoothly without showing surprise.", example: "Without missing a beat, she answered the unexpected question.", examplePt: "Sem hesitar, ela respondeu à pergunta inesperada.", synonyms: ["without hesitation"] },
  { id: "at-ones-wits-end", word: "be at one's wits' end", translation: "estar sem saber o que fazer / estar desesperado", ipa: "bi æt wʌnz wɪts ɛnd", meaningPt: "Usado quando todas as ideias foram esgotadas diante de um problema grave.", meaningEn: "Used when every idea has been exhausted in the face of a serious problem.", example: "I was at my wits' end after hours of troubleshooting.", examplePt: "Eu já não sabia o que fazer depois de horas tentando resolver o problema.", synonyms: ["be desperate"] },
  { id: "in-dire-straits", word: "be in dire straits", translation: "estar em situação crítica / estar em sérias dificuldades", ipa: "bi ɪn ˈdaɪər streɪts", meaningPt: "Descreve uma condição muito grave, especialmente financeira ou operacional.", meaningEn: "Describes a very serious condition, especially financial or operational.", example: "The charity was in dire straits after losing its funding.", examplePt: "A instituição estava em sérias dificuldades após perder o financiamento.", synonyms: ["be in severe trouble"] },
  { id: "on-cloud-nine", word: "be on cloud nine", translation: "estar extremamente feliz / estar nas nuvens", ipa: "bi ɑːn klaʊd naɪn", meaningPt: "Significa estar muito feliz ou empolgado.", meaningEn: "Means feeling extremely happy or delighted.", example: "She was on cloud nine after receiving the news.", examplePt: "Ela estava nas nuvens depois de receber a notícia.", synonyms: ["be overjoyed"] },
  { id: "flip-ones-lid", word: "flip one's lid", translation: "perder a cabeça / perder o controle emocional", ipa: "flɪp wʌnz lɪd", meaningPt: "Expressão informal para ficar subitamente muito zangado ou agitado.", meaningEn: "An informal expression for suddenly becoming very angry or agitated.", example: "He flipped his lid when he saw the damage.", examplePt: "Ele perdeu a cabeça quando viu o estrago.", synonyms: ["lose one's temper"] },
  { id: "on-an-even-keel", word: "be on an even keel", translation: "estar estável / estar sob controle", ipa: "bi ɑːn ən ˈiːvən kiːl", meaningPt: "Indica uma condição equilibrada, estável e controlada.", meaningEn: "Indicates a balanced, stable and controlled condition.", example: "The new routine kept the project on an even keel.", examplePt: "A nova rotina manteve o projeto estável.", synonyms: ["be stable"] },
]

function conjugations(word: string): NonNullable<Flashcard["conjugations"]> | undefined {
  if (word === "rule out") return { simplePresent: "rule out / rules out", simplePast: "ruled out", presentContinuous: "am/is/are ruling out", pastContinuous: "was/were ruling out", presentPerfect: "have/has ruled out", pastPerfect: "had ruled out" }
  if (word === "knuckle down") return { simplePresent: "knuckle down / knuckles down", simplePast: "knuckled down", presentContinuous: "am/is/are knuckling down", pastContinuous: "was/were knuckling down", presentPerfect: "have/has knuckled down", pastPerfect: "had knuckled down" }
  return undefined
}

export const VOCAB_IDIOMS_CATALOG: readonly VocabIdiomsCatalogEntry[] = source.map((entry) => ({
  catalogId: `idiom-${entry.id}`,
  catalogRevision: 2,
  word: entry.word,
  partOfSpeech: entry.partOfSpeech ?? "idiom",
  translation: entry.translation,
  ipa: entry.ipa,
  usageNote: entry.meaningPt,
  usageNoteEn: entry.meaningEn,
  synonyms: (entry.synonyms ?? []).map((word) => ({ word, type: "literal" as const })),
  antonyms: (entry.antonyms ?? []).map((word) => ({ word, type: "literal" as const })),
  example: entry.example,
  exampleTranslation: entry.examplePt,
  alternativeForms: [],
  conjugations: conjugations(entry.word),
  verbType: entry.partOfSpeech === "phrasal-verb" ? "regular" : undefined,
  falseCognate: entry.literalTrap ? { isFalseCognate: true, warning: entry.literalTrap } : undefined,
  familyKey: entry.word,
  usageStatus: "current",
}))

function hashContent(content: unknown) {
  let hash = 2166136261
  for (const char of JSON.stringify(content)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

function idiomHashContent(entry: VocabIdiomsCatalogEntry | Flashcard) {
  return { word: entry.word, partOfSpeech: entry.partOfSpeech, translation: entry.translation, ipa: entry.ipa ?? "", usageNote: entry.usageNote ?? "", usageNoteEn: entry.usageNoteEn ?? "", synonyms: entry.synonyms, antonyms: entry.antonyms, example: entry.example, exampleTranslation: entry.exampleTranslation ?? "", alternativeForms: entry.alternativeForms, conjugations: entry.conjugations ?? null, verbType: entry.verbType ?? null, falseCognate: entry.falseCognate ?? null, familyKey: entry.familyKey ?? "", usageStatus: entry.usageStatus ?? "current" }
}

export function vocabIdiomsContentHash(entry: VocabIdiomsCatalogEntry | Flashcard) {
  return hashContent(idiomHashContent(entry))
}

export function vocabIdiomsLegacyContentHash(entry: VocabIdiomsCatalogEntry | Flashcard) {
  const { falseCognate: _ignored, ...legacy } = idiomHashContent(entry)
  return hashContent(legacy)
}

export function validateVocabIdiomsCatalog() {
  const ids = new Set<string>()
  const words = new Set<string>()
  for (const entry of VOCAB_IDIOMS_CATALOG) {
    if (!entry.catalogId || ids.has(entry.catalogId)) throw new Error(`Invalid or duplicate idiom catalog id: ${entry.catalogId}`)
    ids.add(entry.catalogId)
    const key = `${entry.word.toLowerCase()}__${entry.partOfSpeech}`
    if (words.has(key)) throw new Error(`Duplicate idiom catalog entry: ${key}`)
    words.add(key)
    if (![entry.word, entry.translation, entry.ipa, entry.usageNote, entry.usageNoteEn, entry.example, entry.exampleTranslation].every((value) => value?.trim())) throw new Error(`Incomplete idiom catalog entry: ${entry.catalogId}`)
    if (!entry.translation.includes(" / ")) throw new Error(`Unnormalized idiom translations: ${entry.catalogId}`)
    if (entry.example.split(/\s+/).length < 4 || !/[.!?]$/.test(entry.example)) throw new Error(`Structurally invalid idiom example: ${entry.catalogId}`)
  }
}
