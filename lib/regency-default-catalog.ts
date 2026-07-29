import type { RegencyCategory, RegencyComplement } from "@/lib/types"

export const REGENCY_DEFAULT_CATALOG_VERSION = 3
export const REGENCY_DEFAULT_FOLDER_NAME = "Regency Essentials"
export const REGENCY_DEFAULT_FOLDER_COLOR = "default"

export interface RegencyCatalogEntry {
  catalogId: string
  catalogRevision: number
  term: string
  category: RegencyCategory
  pattern: string
  complement: RegencyComplement
  example: string
  exampleTranslation: string
  meaningPt: string
  contrastPt: string
}

const e = (
  catalogId: string, term: string, category: RegencyCategory, pattern: string,
  complement: RegencyComplement, example: string, exampleTranslation: string,
  meaningPt: string, contrastPt = "",
): RegencyCatalogEntry => ({ catalogId, catalogRevision: 1, term, category, pattern, complement, example, exampleTranslation, meaningPt, contrastPt })

// Curated from the supplied material. The PDF is a source of candidates, not runtime data.
export const REGENCY_DEFAULT_CATALOG: readonly RegencyCatalogEntry[] = [
  e("complain-about", "complain", "verb", "about + noun", "prepositional-phrase", "Customers complained about the delay.", "Os clientes reclamaram do atraso.", "Usado para indicar o assunto de uma reclamação."),
  e("struggle-to", "struggle", "verb", "to + infinitive", "infinitive", "She struggled to remain calm.", "Ela se esforçou para permanecer calma.", "Expressa dificuldade para conseguir realizar uma ação.", "Compare: ‘struggle with’ apresenta o problema enfrentado; aqui o foco está na ação difícil."),
  e("struggle-with", "struggle", "verb", "with + noun", "prepositional-phrase", "Many students struggle with pronunciation.", "Muitos estudantes têm dificuldade com a pronúncia.", "Apresenta o problema ou a dificuldade enfrentada.", "Compare: ‘struggle to’ introduz uma ação que é difícil realizar."),
  e("struggle-for", "struggle", "verb", "for + noun", "prepositional-phrase", "The community struggled for equal rights.", "A comunidade lutou por direitos iguais.", "Indica a causa, objetivo ou resultado pelo qual se luta.", "Compare: ‘struggle against’ apresenta aquilo que se combate."),
  e("struggle-against", "struggle", "verb", "against + noun", "prepositional-phrase", "They struggled against discrimination.", "Eles lutaram contra a discriminação.", "Indica a força, problema ou oponente que se combate.", "Compare: ‘struggle for’ apresenta aquilo que se deseja alcançar."),
  e("depend-on", "depend", "verb", "on + noun", "prepositional-phrase", "The result depends on the weather.", "O resultado depende do clima.", "Indica a condição ou pessoa da qual algo depende."),
  e("approve-of", "approve", "verb", "of + noun", "prepositional-phrase", "Her parents approve of the decision.", "Os pais dela aprovam a decisão.", "Significa considerar algo bom, aceitável ou correto.", "Compare: ‘approve + noun’ é a autorização formal de uma proposta ou medida."),
  e("approve-direct", "approve", "verb", "+ noun (no preposition)", "noun", "The board approved the budget.", "O conselho aprovou o orçamento.", "Significa autorizar formalmente uma proposta, plano ou medida.", "Compare: ‘approve of’ expressa opinião favorável, sem necessariamente dar autorização."),
  e("forgive-for", "forgive", "verb", "someone + for + noun/gerund", "gerund", "Please forgive me for arriving late.", "Por favor, perdoe-me por chegar tarde.", "Liga a pessoa perdoada ao motivo do perdão."),
  e("spend-on", "spend", "verb", "money/time + on + noun", "prepositional-phrase", "We spend too much money on repairs.", "Gastamos dinheiro demais com reparos.", "Apresenta aquilo em que dinheiro ou tempo foi gasto."),
  e("shout-at", "shout", "verb", "at + person", "prepositional-phrase", "He shouted at the driver in anger.", "Ele gritou com o motorista, irritado.", "Indica que o grito é dirigido agressivamente a alguém.", "Compare: ‘shout to’ enfatiza alcançar alguém à distância, não hostilidade."),
  e("shout-to", "shout", "verb", "to + person", "prepositional-phrase", "She shouted to her friend across the street.", "Ela gritou para a amiga do outro lado da rua.", "Indica gritar para ser ouvido por alguém, geralmente à distância.", "Compare: ‘shout at’ normalmente sugere raiva ou repreensão."),
  e("throw-at", "throw", "verb", "object + at + target", "prepositional-phrase", "Do not throw stones at the window.", "Não jogue pedras na janela.", "O alvo é aquilo que se pretende atingir.", "Compare: ‘throw to’ apresenta o destinatário que deve receber o objeto."),
  e("throw-to", "throw", "verb", "object + to + person", "prepositional-phrase", "Throw the ball to me.", "Jogue a bola para mim.", "Apresenta quem deve receber o objeto lançado.", "Compare: ‘throw at’ trata a pessoa ou coisa como alvo."),
  e("argue-with", "argue", "verb", "with + person", "prepositional-phrase", "I argued with my brother yesterday.", "Eu discuti com meu irmão ontem.", "Apresenta a pessoa com quem se discute."),
  e("argue-about", "argue", "verb", "about + topic", "prepositional-phrase", "They argued about money.", "Eles discutiram sobre dinheiro.", "Apresenta o assunto da discussão.", "Compare: ‘argue for/against’ apresenta a posição defendida."),
  e("argue-for", "argue", "verb", "for + position", "prepositional-phrase", "She argued for stricter safety rules.", "Ela defendeu regras de segurança mais rígidas.", "Indica a posição ou proposta defendida.", "Compare: ‘argue against’ apresenta a posição combatida."),
  e("argue-against", "argue", "verb", "against + position", "prepositional-phrase", "They argued against the proposed ban.", "Eles argumentaram contra a proibição proposta.", "Indica a posição ou proposta contestada.", "Compare: ‘argue for’ apresenta a posição defendida."),
  e("known-as", "known", "adjective", "as + role/name", "prepositional-phrase", "The city is known as the birthplace of jazz.", "A cidade é conhecida como o berço do jazz.", "Apresenta o nome, papel ou identidade pela qual algo é conhecido.", "Compare: ‘known for’ apresenta a característica que tornou algo famoso."),
  e("known-for", "known", "adjective", "for + noun", "prepositional-phrase", "The region is known for its coffee.", "A região é conhecida por seu café.", "Apresenta a qualidade ou produto que tornou alguém ou algo famoso.", "Compare: ‘known as’ apresenta um nome ou identidade."),
  e("derived-from", "derived", "adjective", "from + source", "prepositional-phrase", "The word is derived from Latin.", "A palavra deriva do latim.", "Apresenta a origem de uma palavra, ideia ou substância."),
  e("focus-on", "focus", "verb", "on + noun/gerund", "gerund", "Let us focus on solving the problem.", "Vamos nos concentrar em resolver o problema.", "Apresenta o assunto ou tarefa que recebe atenção."),
  e("insist-on", "insist", "verb", "on + noun/gerund", "gerund", "She insisted on paying for dinner.", "Ela insistiu em pagar o jantar.", "Apresenta aquilo que alguém exige ou se mantém decidido a fazer."),
  e("apologize-to", "apologize", "verb", "to + person", "prepositional-phrase", "He apologized to his colleague.", "Ele pediu desculpas ao colega.", "Apresenta a pessoa que recebe o pedido de desculpas.", "Compare: ‘apologize for’ apresenta o motivo do pedido."),
  e("apologize-for", "apologize", "verb", "for + noun/gerund", "gerund", "He apologized for interrupting the meeting.", "Ele pediu desculpas por interromper a reunião.", "Apresenta a ação ou situação que motivou o pedido de desculpas.", "Compare: ‘apologize to’ apresenta a pessoa a quem se pede desculpas."),
  e("think-about", "think", "verb", "about + noun", "prepositional-phrase", "I am thinking about changing jobs.", "Estou pensando em mudar de emprego.", "Indica considerar algo com atenção ou por algum tempo.", "Compare: ‘think of’ pode indicar uma opinião, lembrança ou ideia que surge."),
  e("think-of", "think", "verb", "of + noun", "prepositional-phrase", "What do you think of the new design?", "O que você acha do novo design?", "Neste uso, pede ou apresenta uma opinião sobre algo.", "Compare: ‘think about’ enfatiza o processo de refletir ou considerar."),
  e("familiar-with", "familiar", "adjective", "with + subject", "prepositional-phrase", "Are you familiar with this software?", "Você conhece bem este software?", "A pessoa tem conhecimento ou experiência com o assunto.", "Compare: ‘familiar to’ descreve algo reconhecível para uma pessoa."),
  e("familiar-to", "familiar", "adjective", "to + person", "prepositional-phrase", "That melody sounds familiar to me.", "Essa melodia me parece familiar.", "Algo é reconhecível para a pessoa apresentada.", "Compare: ‘familiar with’ descreve quem conhece um assunto."),
  e("married-to", "married", "adjective", "to + person", "prepositional-phrase", "She is married to an architect.", "Ela é casada com um arquiteto.", "Apresenta o cônjuge; em inglês padrão usa-se ‘to’, não ‘with’."),
  e("good-at", "good", "adjective", "at + skill/activity", "prepositional-phrase", "Maya is good at solving puzzles.", "Maya é boa em resolver quebra-cabeças.", "Indica habilidade em uma atividade.", "Compare: ‘good with’ indica facilidade para lidar com pessoas ou coisas."),
  e("good-with", "good", "adjective", "with + people/things", "prepositional-phrase", "He is good with children.", "Ele sabe lidar bem com crianças.", "Indica facilidade para lidar com pessoas, animais ou ferramentas.", "Compare: ‘good at’ apresenta uma habilidade ou atividade específica."),
  e("good-for", "good", "adjective", "for + person/thing", "prepositional-phrase", "Regular exercise is good for your health.", "Exercício regular faz bem à saúde.", "Indica benefício ou adequação para alguém ou algo.", "Compare: ‘good to’ descreve tratamento bondoso dirigido a alguém."),
  e("good-to", "good", "adjective", "to + person", "prepositional-phrase", "She has always been good to me.", "Ela sempre foi boa comigo.", "Descreve comportamento bondoso em relação a alguém.", "Compare: ‘good for’ indica benefício, não gentileza."),
  e("certain-of", "certain", "adjective", "of + noun/gerund", "prepositional-phrase", "She is certain of winning the race.", "Ela tem certeza de que vencerá a corrida.", "Expressa convicção sobre um fato ou resultado.", "Compare: ‘certain to’ indica que algo certamente acontecerá."),
  e("certain-to", "certain", "adjective", "to + infinitive", "infinitive", "Demand is certain to increase.", "É certo que a demanda aumentará.", "Indica que um evento ou resultado é praticamente inevitável.", "Compare: ‘certain of’ apresenta aquilo de que alguém está convicto."),
  e("dream-about", "dream", "verb", "about + noun", "prepositional-phrase", "I dreamed about the ocean last night.", "Sonhei com o oceano ontem à noite.", "Costuma apresentar o conteúdo de um sonho durante o sono.", "Compare: ‘dream of’ frequentemente expressa desejo ou ambição."),
  e("dream-of", "dream", "verb", "of + noun/gerund", "gerund", "She dreams of becoming a pilot.", "Ela sonha em se tornar piloto.", "Expressa um desejo ou uma ambição.", "Compare: ‘dream about’ costuma apresentar o conteúdo de um sonho ou pensamento."),
  e("stop-gerund", "stop", "verb", "+ gerund", "gerund", "He stopped smoking last year.", "Ele parou de fumar no ano passado.", "Indica interromper ou abandonar a atividade mencionada.", "Compare: ‘stop to + infinitive’ significa interromper outra ação para cumprir uma finalidade."),
  e("stop-to", "stop", "verb", "to + infinitive", "infinitive", "We stopped to buy some water.", "Nós paramos para comprar água.", "Indica interromper uma atividade para realizar outra.", "Compare: ‘stop + gerund’ significa deixar de fazer a própria atividade mencionada."),
  e("blame-for", "blame", "verb", "person + for + noun/gerund", "gerund", "They blamed him for losing the key.", "Eles o culparam por perder a chave.", "Apresenta a pessoa responsabilizada e o motivo da culpa.", "Compare: ‘blame on’ apresenta a causa à qual a culpa é atribuída."),
  e("blame-on", "blame", "verb", "noun + on + person/thing", "prepositional-phrase", "She blamed the delay on traffic.", "Ela atribuiu o atraso ao trânsito.", "Apresenta o problema e aquilo a que ele é atribuído.", "Compare: ‘blame someone for’ começa pela pessoa responsabilizada."),
  e("pay-for", "pay", "verb", "for + product/service", "prepositional-phrase", "Who will pay for the tickets?", "Quem pagará pelos ingressos?", "Apresenta o produto ou serviço comprado.", "Compare: para a pessoa ou quantia paga, ‘pay’ normalmente não usa preposição."),
  e("pay-direct", "pay", "verb", "+ person/amount (no preposition)", "noun", "The company pays the workers promptly.", "A empresa paga os trabalhadores prontamente.", "Apresenta diretamente quem recebe o pagamento ou a quantia paga.", "Compare: ‘pay for’ apresenta o produto ou serviço comprado."),
  e("object-to", "object", "verb", "to + noun/gerund", "gerund", "Residents objected to building a highway there.", "Os moradores se opuseram à construção de uma rodovia ali.", "Expressa oposição; aqui ‘to’ é preposição e aceita gerúndio."),
  e("agree-with", "agree", "verb", "with + person/opinion", "prepositional-phrase", "I agree with your analysis.", "Concordo com sua análise.", "Indica concordância com uma pessoa, opinião ou posição.", "Compare: ‘agree to’ significa aceitar uma proposta ou condição."),
  e("agree-to", "agree", "verb", "to + proposal/terms", "prepositional-phrase", "They agreed to the new terms.", "Eles concordaram com os novos termos.", "Indica aceitar formalmente uma proposta, plano ou condição.", "Compare: ‘agree with’ expressa compartilhar uma opinião."),
  e("agree-on", "agree", "verb", "on + topic/decision", "prepositional-phrase", "We agreed on a date for the meeting.", "Chegamos a um acordo sobre uma data para a reunião.", "Indica que as partes chegaram a uma decisão comum sobre um assunto."),
  e("discuss-direct", "discuss", "verb", "+ noun (no preposition)", "noun", "We discussed the problem after lunch.", "Discutimos o problema depois do almoço.", "O assunto vem como objeto direto; neste uso padrão não se acrescenta ‘about’."),
  e("rely-on", "rely", "verb", "on + person/thing", "prepositional-phrase", "You can rely on this information.", "Você pode confiar nesta informação.", "Apresenta a pessoa ou coisa em que se confia."),
  e("succeed-in", "succeed", "verb", "in + noun/gerund", "gerund", "She succeeded in finding a solution.", "Ela conseguiu encontrar uma solução.", "Apresenta a atividade em que se obteve êxito."),
  e("refrain-from", "refrain", "verb", "from + noun/gerund", "gerund", "Please refrain from using your phone.", "Por favor, evite usar o celular.", "Apresenta a ação que alguém deliberadamente evita."),
  e("stem-from", "stem", "verb", "from + source", "prepositional-phrase", "The confusion stems from a translation error.", "A confusão decorre de um erro de tradução.", "Apresenta a origem ou causa de uma situação."),
  e("suffer-from", "suffer", "verb", "from + illness/problem", "prepositional-phrase", "He suffers from chronic back pain.", "Ele sofre de dor crônica nas costas.", "Apresenta a doença ou problema que afeta alguém."),
  e("threaten-to", "threaten", "verb", "to + infinitive", "infinitive", "The company threatened to cancel the contract.", "A empresa ameaçou cancelar o contrato.", "Apresenta a ação que alguém ameaça realizar."),
  e("hint-at", "hint", "verb", "at + noun", "prepositional-phrase", "The report hints at deeper problems.", "O relatório sugere problemas mais profundos.", "Apresenta indiretamente a ideia ou possibilidade sugerida."),
  e("abide-by", "abide", "verb", "by + rule/decision", "prepositional-phrase", "All participants must abide by the safety rules.", "Todos os participantes devem cumprir as regras de segurança.", "Indica aceitar e cumprir uma regra, decisão ou acordo."),
  e("accuse-of", "accuse", "verb", "person + of + noun/gerund", "gerund", "They accused the supplier of hiding the defect.", "Eles acusaram o fornecedor de esconder o defeito.", "Liga a pessoa acusada à infração ou ação atribuída a ela."),
  e("accustomed-to", "accustomed", "adjective", "to + noun/gerund", "gerund", "The team is accustomed to working under pressure.", "A equipe está acostumada a trabalhar sob pressão.", "Indica familiaridade adquirida com uma situação ou atividade; aqui ‘to’ é preposição e aceita gerúndio."),
  e("take-advantage-of", "take advantage", "verb", "of + opportunity/resource", "prepositional-phrase", "Take advantage of the quiet morning to study.", "Aproveite a manhã tranquila para estudar.", "Significa aproveitar uma oportunidade ou recurso disponível."),
  e("afraid-of", "afraid", "adjective", "of + noun/gerund", "gerund", "She is not afraid of asking difficult questions.", "Ela não tem medo de fazer perguntas difíceis.", "Apresenta aquilo que causa medo ou receio."),
  e("aim-at", "aim", "verb", "at + target/noun", "prepositional-phrase", "The campaign aims at reducing food waste.", "A campanha visa reduzir o desperdício de alimentos.", "Apresenta o alvo ou objetivo de uma ação; pode ser seguido de substantivo ou gerúndio.", "Compare: ‘aim to’ introduz diretamente a ação que se pretende realizar."),
  e("aim-to", "aim", "verb", "to + infinitive", "infinitive", "The campaign aims to reduce food waste.", "A campanha pretende reduzir o desperdício de alimentos.", "Introduz diretamente a ação ou resultado pretendido.", "Compare: ‘aim at’ apresenta um alvo ou objetivo como substantivo ou gerúndio."),
  e("apply-for", "apply", "verb", "for + job/course/benefit", "prepositional-phrase", "She will apply for the engineering program.", "Ela se candidatará ao programa de engenharia.", "Apresenta a vaga, curso, benefício ou documento solicitado.", "Compare: ‘apply to’ apresenta a instituição que recebe a candidatura ou aquilo a que uma regra se aplica."),
  e("apply-to", "apply", "verb", "to + institution/person", "prepositional-phrase", "He plans to apply to three universities.", "Ele pretende se candidatar a três universidades.", "Neste uso, apresenta a instituição que recebe a candidatura.", "Compare: ‘apply for’ apresenta a vaga, curso ou benefício solicitado."),
  e("aware-of", "aware", "adjective", "of + noun", "prepositional-phrase", "Are you aware of the risks involved?", "Você está ciente dos riscos envolvidos?", "Apresenta a situação ou informação da qual alguém tem conhecimento."),
  e("believe-in", "believe", "verb", "in + person/idea", "prepositional-phrase", "You must believe in your ability to improve.", "Você precisa acreditar na sua capacidade de melhorar.", "Expressa confiança, fé ou aceitação da existência ou do valor de alguém ou algo."),
  e("belong-to", "belong", "verb", "to + owner/group", "prepositional-phrase", "This equipment belongs to the laboratory.", "Este equipamento pertence ao laboratório.", "Apresenta o proprietário, grupo ou categoria ao qual algo pertence."),
  e("capable-of", "capable", "adjective", "of + noun/gerund", "gerund", "The device is capable of detecting small changes.", "O dispositivo é capaz de detectar pequenas mudanças.", "Apresenta a ação ou resultado que alguém ou algo tem capacidade de realizar."),
  e("care-about", "care", "verb", "about + person/issue", "prepositional-phrase", "Good engineers care about public safety.", "Bons engenheiros se importam com a segurança pública.", "Expressa interesse, preocupação ou importância emocional.", "Compare: ‘care for’ costuma significar cuidar de alguém ou, sobretudo em negativas e perguntas, gostar de algo."),
  e("care-for", "care", "verb", "for + person", "prepositional-phrase", "She cares for her elderly father.", "Ela cuida do pai idoso.", "Neste uso, significa cuidar e atender às necessidades de alguém.", "Compare: ‘care about’ expressa preocupação ou importância emocional."),
  e("comply-with", "comply", "verb", "with + rule/request", "prepositional-phrase", "All vessels must comply with international regulations.", "Todas as embarcações devem cumprir os regulamentos internacionais.", "Apresenta a regra, solicitação ou exigência que deve ser obedecida."),
  e("concentrate-on", "concentrate", "verb", "on + noun/gerund", "gerund", "Concentrate on checking the final calculation.", "Concentre-se em verificar o cálculo final.", "Apresenta o assunto ou tarefa que recebe atenção concentrada."),
  e("congratulate-on", "congratulate", "verb", "person + on + noun/gerund", "gerund", "We congratulated her on passing the exam.", "Nós a parabenizamos por passar na prova.", "Liga a pessoa parabenizada ao motivo da congratulação."),
  e("consist-of", "consist", "verb", "of + components", "prepositional-phrase", "The course consists of six modules.", "O curso consiste em seis módulos.", "Apresenta as partes que compõem um todo."),
  e("count-on", "count", "verb", "on + person/thing", "prepositional-phrase", "You can count on our support.", "Você pode contar com nosso apoio.", "Apresenta a pessoa ou coisa em que se confia para obter ajuda ou um resultado."),
  e("deal-with", "deal", "verb", "with + problem/person", "prepositional-phrase", "How do you deal with pressure before an exam?", "Como você lida com a pressão antes de uma prova?", "Apresenta o problema, assunto ou pessoa que se administra ou enfrenta."),
  e("deprive-of", "deprive", "verb", "person + of + noun", "prepositional-phrase", "The long delay deprived passengers of essential information.", "O longo atraso privou os passageiros de informações essenciais.", "Liga alguém àquilo que lhe foi retirado ou negado."),
  e("devote-to", "devote", "verb", "time/effort + to + noun/gerund", "gerund", "She devoted the afternoon to reviewing mathematics.", "Ela dedicou a tarde à revisão de matemática.", "Apresenta a atividade ou causa à qual tempo, energia ou recursos são dedicados; ‘to’ é preposição."),
  e("die-of", "die", "verb", "of + illness/internal cause", "prepositional-phrase", "Many people still die of preventable diseases.", "Muitas pessoas ainda morrem de doenças evitáveis.", "Usado principalmente para doença ou causa interna da morte.", "Compare: ‘die from’ é comum quando se enfatiza uma causa externa, ferimento ou consequência."),
  e("die-from", "die", "verb", "from + external cause", "prepositional-phrase", "Several animals died from injuries after the fire.", "Vários animais morreram em decorrência de ferimentos após o incêndio.", "Enfatiza uma causa externa, ferimento ou consequência que levou à morte.", "Compare: ‘die of’ é especialmente comum com doenças e causas internas; há sobreposição entre os usos."),
  e("differ-from", "differ", "verb", "from + noun", "prepositional-phrase", "This method differs from the previous one.", "Este método difere do anterior.", "Apresenta a pessoa ou coisa usada como ponto de comparação."),
  e("disapprove-of", "disapprove", "verb", "of + noun/gerund", "gerund", "The committee disapproves of changing the rules now.", "O comitê desaprova mudar as regras agora.", "Expressa opinião desfavorável sobre uma ação, comportamento ou decisão."),
  e("dispose-of", "dispose", "verb", "of + unwanted thing", "prepositional-phrase", "Please dispose of the chemical waste safely.", "Descarte os resíduos químicos com segurança.", "Neste phrasal-prepositional verb, significa eliminar ou descartar algo indesejado."),
  e("fond-of", "fond", "adjective", "of + noun/gerund", "gerund", "He is fond of reading naval history.", "Ele gosta de ler história naval.", "Expressa afeição ou gosto por alguém, algo ou uma atividade."),
  e("guilty-of", "guilty", "adjective", "of + offence", "prepositional-phrase", "The officer was found guilty of misconduct.", "O oficial foi considerado culpado de má conduta.", "Apresenta o crime, infração ou comportamento pelo qual alguém é culpado."),
  e("hope-for", "hope", "verb", "for + noun", "prepositional-phrase", "We hope for a peaceful solution.", "Esperamos uma solução pacífica.", "Apresenta o resultado ou acontecimento desejado como substantivo.", "Compare: ‘hope to’ introduz uma ação que o próprio sujeito deseja realizar."),
  e("hope-to", "hope", "verb", "to + infinitive", "infinitive", "We hope to reach an agreement soon.", "Esperamos chegar a um acordo em breve.", "Introduz uma ação que o sujeito deseja ou espera realizar.", "Compare: ‘hope for’ apresenta o resultado desejado como substantivo."),
  e("inferior-to", "inferior", "adjective", "to + noun", "prepositional-phrase", "This material is inferior to the original alloy.", "Este material é inferior à liga original.", "Apresenta aquilo usado como referência de comparação; emprega-se ‘to’, não ‘than’."),
  e("interfere-with", "interfere", "verb", "with + process/person", "prepositional-phrase", "Anxiety can interfere with your performance.", "A ansiedade pode interferir no seu desempenho.", "Apresenta a atividade, processo ou pessoa prejudicada por uma interferência."),
  e("jealous-of", "jealous", "adjective", "of + person/thing", "prepositional-phrase", "She was never jealous of her colleagues' success.", "Ela nunca teve inveja do sucesso dos colegas.", "Apresenta a pessoa, conquista ou relação que provoca ciúme ou inveja."),
  e("look-forward-to", "look forward", "verb", "to + noun/gerund", "gerund", "I look forward to meeting the new team.", "Estou ansioso para conhecer a nova equipe.", "Expressa expectativa positiva; ‘to’ é preposição e, antes de verbo, exige gerúndio."),
  e("prevent-from", "prevent", "verb", "person/thing + from + gerund", "gerund", "Heavy fog prevented the ship from leaving the port.", "A neblina intensa impediu o navio de deixar o porto.", "Liga aquilo que é impedido à ação que não acontece; não se usa ‘prevent ... to do’."),
  e("protect-from", "protect", "verb", "person/thing + from + danger", "prepositional-phrase", "These glasses protect your eyes from ultraviolet light.", "Estes óculos protegem seus olhos da luz ultravioleta.", "Liga a pessoa ou coisa protegida ao perigo evitado."),
  e("proud-of", "proud", "adjective", "of + noun/gerund", "gerund", "Your family will be proud of your progress.", "Sua família terá orgulho do seu progresso.", "Apresenta a pessoa, conquista ou ação que causa orgulho."),
  e("recover-from", "recover", "verb", "from + illness/setback", "prepositional-phrase", "The patient is recovering from surgery.", "O paciente está se recuperando da cirurgia.", "Apresenta a doença, experiência ou dificuldade após a qual ocorre recuperação."),
  e("responsible-for", "responsible", "adjective", "for + noun/gerund", "gerund", "The captain is responsible for keeping the crew safe.", "O capitão é responsável por manter a tripulação segura.", "Apresenta a pessoa, tarefa ou resultado sob responsabilidade de alguém."),
  e("superior-to", "superior", "adjective", "to + noun", "prepositional-phrase", "This design is superior to the older model.", "Este projeto é superior ao modelo anterior.", "Apresenta aquilo usado como referência de comparação; emprega-se ‘to’, não ‘than’."),
  e("suspect-of", "suspect", "verb", "person + of + noun/gerund", "gerund", "Investigators suspect him of leaking confidential files.", "Os investigadores suspeitam que ele tenha vazado arquivos confidenciais.", "Liga a pessoa suspeita à infração ou ação que se acredita que ela praticou."),
  e("sympathize-with", "sympathize", "verb", "with + person", "prepositional-phrase", "I sympathize with your frustration.", "Eu compreendo e me solidarizo com sua frustração.", "Apresenta a pessoa ou sentimento pelo qual se demonstra compreensão e solidariedade."),
  e("translate-into", "translate", "verb", "text + into + target language", "prepositional-phrase", "Please translate this paragraph into Portuguese.", "Por favor, traduza este parágrafo para o português.", "Apresenta o idioma de destino da tradução.", "Compare: ‘translate from’ apresenta o idioma do texto original."),
  e("translate-from", "translate", "verb", "text + from + source language", "prepositional-phrase", "She translates technical manuals from German.", "Ela traduz manuais técnicos do alemão.", "Apresenta o idioma de origem do texto traduzido.", "Compare: ‘translate into’ apresenta o idioma de destino."),
  e("typical-of", "typical", "adjective", "of + person/thing", "prepositional-phrase", "That careful response is typical of her.", "Essa resposta cuidadosa é típica dela.", "Indica que uma característica ou comportamento representa bem alguém ou algo."),
  e("warn-about", "warn", "verb", "person + about + danger", "prepositional-phrase", "The guide warned us about the strong current.", "O guia nos alertou sobre a correnteza forte.", "Apresenta um perigo ou problema específico explicado à pessoa alertada.", "Compare: ‘warn of’ anuncia a possibilidade de um perigo; ‘warn against’ aconselha a evitar uma ação."),
  e("warn-of", "warn", "verb", "of + danger", "prepositional-phrase", "The signs warn of falling rocks.", "As placas alertam para a queda de pedras.", "Anuncia a existência ou possibilidade de um perigo.", "Compare: ‘warn about’ costuma informar alguém sobre um risco específico; ‘warn against’ desaconselha uma ação."),
  e("warn-against", "warn", "verb", "person + against + noun/gerund", "gerund", "Experts warn drivers against using flooded roads.", "Especialistas alertam os motoristas para não usarem estradas alagadas.", "Aconselha alguém a não realizar uma ação potencialmente perigosa.", "Compare: ‘warn about/of’ apresenta o perigo; aqui o foco está na ação a evitar."),
  e("yield-to", "yield", "verb", "to + force/demand", "prepositional-phrase", "The structure must not yield to heavy winds.", "A estrutura não deve ceder a ventos fortes.", "Apresenta a força, pressão ou exigência diante da qual alguém ou algo cede."),
]

const contentFields = ["term", "category", "pattern", "complement", "example", "exampleTranslation", "meaningPt", "contrastPt"] as const

export function regencyCatalogContentHash(value: {
  term: string
  category: RegencyCategory
  pattern: string
  complement: RegencyComplement
  example: string
  exampleTranslation?: string
  meaningPt?: string
  contrastPt?: string
}): string {
  const input = contentFields.map((field) => String(value[field] ?? "").trim()).join("\u001f")
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function validateRegencyDefaultCatalog(): void {
  const ids = new Set<string>()
  const patterns = new Set<string>()
  const familySizes = new Map<string, number>()
  for (const entry of REGENCY_DEFAULT_CATALOG) familySizes.set(entry.term.toLowerCase(), (familySizes.get(entry.term.toLowerCase()) ?? 0) + 1)
  for (const entry of REGENCY_DEFAULT_CATALOG) {
    const required = [entry.catalogId, entry.term, entry.pattern, entry.example, entry.exampleTranslation, entry.meaningPt]
    if (required.some((value) => !value.trim())) throw new Error(`Incomplete Regency catalog entry: ${entry.catalogId || "unknown"}`)
    if (ids.has(entry.catalogId)) throw new Error(`Duplicate Regency catalog id: ${entry.catalogId}`)
    ids.add(entry.catalogId)
    const patternKey = `${entry.term.trim().toLowerCase()}\u001f${entry.category}\u001f${entry.pattern.trim().toLowerCase()}`
    if (patterns.has(patternKey)) throw new Error(`Duplicate Regency family pattern: ${entry.term} ${entry.pattern}`)
    patterns.add(patternKey)
    if (!entry.example.toLowerCase().includes(entry.term.toLowerCase())) throw new Error(`Example does not contain term: ${entry.catalogId}`)
    if ((familySizes.get(entry.term.toLowerCase()) ?? 0) === 1 && entry.contrastPt) throw new Error(`Artificial contrast in single-pattern family: ${entry.catalogId}`)
    if (entry.contrastPt && !entry.contrastPt.startsWith("Compare:")) throw new Error(`Invalid contrast label: ${entry.catalogId}`)
  }
}
