import type { Flashcard, PartOfSpeech } from "@/lib/types"

export const VOCAB_FALSE_COGNATES_CATALOG_VERSION = 3
export const VOCAB_FALSE_COGNATES_FOLDER_NAME = "False Cognates Essentials"
export const VOCAB_FALSE_COGNATES_FOLDER_COLOR = "default"

export type VocabFalseCognatesCatalogEntry = Omit<Flashcard, "id" | "folderId" | "createdAt" | "audioSrc" | "catalogContentHash">

type SourceEntry = {
  id: string
  word: string
  partOfSpeech: PartOfSpeech
  translation: string
  deceptivePortuguese: string
  correctEnglish: string
  example: string
  exampleTranslation: string
}

const source: SourceEntry[] = [
  { id: "actual", word: "actual", partOfSpeech: "adjective", translation: "real / verdadeiro", deceptivePortuguese: "atual", correctEnglish: "current", example: "The actual cost was higher than the estimate.", exampleTranslation: "O custo real foi maior que a estimativa." },
  { id: "agenda", word: "agenda", partOfSpeech: "noun", translation: "pauta / lista de assuntos", deceptivePortuguese: "agenda", correctEnglish: "planner / diary", example: "The budget is the first item on today's agenda.", exampleTranslation: "O orçamento é o primeiro item da pauta de hoje." },
  { id: "anthem", word: "anthem", partOfSpeech: "noun", translation: "hino", deceptivePortuguese: "antena", correctEnglish: "antenna / aerial", example: "The crowd stood for the national anthem.", exampleTranslation: "A multidão se levantou para o hino nacional." },
  { id: "apologize", word: "apologize", partOfSpeech: "verb", translation: "pedir desculpas / desculpar-se", deceptivePortuguese: "apologizar (fazer apologia)", correctEnglish: "defend / praise", example: "You should apologize for arriving late.", exampleTranslation: "Você deveria pedir desculpas por chegar atrasado." },
  { id: "attend", word: "attend", partOfSpeech: "verb", translation: "comparecer / participar / assistir", deceptivePortuguese: "atender ao telefone", correctEnglish: "answer the phone", example: "More than two hundred people attended the conference.", exampleTranslation: "Mais de duzentas pessoas participaram da conferência." },
  { id: "balcony", word: "balcony", partOfSpeech: "noun", translation: "sacada / varanda suspensa", deceptivePortuguese: "balcão", correctEnglish: "counter", example: "We watched the sunset from the balcony.", exampleTranslation: "Nós assistimos ao pôr do sol da sacada." },
  { id: "casualty", word: "casualty", partOfSpeech: "noun", translation: "baixa / vítima de acidente ou guerra", deceptivePortuguese: "casualidade", correctEnglish: "chance / coincidence", example: "The report confirmed one casualty in the accident.", exampleTranslation: "O relatório confirmou uma vítima no acidente." },
  { id: "cigar", word: "cigar", partOfSpeech: "noun", translation: "charuto", deceptivePortuguese: "cigarro", correctEnglish: "cigarette", example: "He bought a cigar to celebrate the occasion.", exampleTranslation: "Ele comprou um charuto para comemorar a ocasião." },
  { id: "college", word: "college", partOfSpeech: "noun", translation: "faculdade", deceptivePortuguese: "colégio", correctEnglish: "school", example: "She plans to study engineering in college.", exampleTranslation: "Ela pretende estudar engenharia na faculdade." },
  { id: "costume", word: "costume", partOfSpeech: "noun", translation: "fantasia / traje típico", deceptivePortuguese: "costume", correctEnglish: "habit / custom", example: "He wore a pirate costume to the party.", exampleTranslation: "Ele usou uma fantasia de pirata na festa." },
  { id: "data", word: "data", partOfSpeech: "noun", translation: "dados / informações", deceptivePortuguese: "data", correctEnglish: "date", example: "The researchers analyzed the data carefully.", exampleTranslation: "Os pesquisadores analisaram os dados cuidadosamente." },
  { id: "devolve", word: "devolve", partOfSpeech: "verb", translation: "transferir / delegar", deceptivePortuguese: "devolver", correctEnglish: "return / give back / refund", example: "The government plans to devolve more power to local councils.", exampleTranslation: "O governo pretende transferir mais poder aos conselhos locais." },
  { id: "discussion", word: "discussion", partOfSpeech: "noun", translation: "debate / conversa / análise", deceptivePortuguese: "discussão (briga)", correctEnglish: "argument", example: "We had a productive discussion about the proposal.", exampleTranslation: "Tivemos um debate produtivo sobre a proposta." },
  { id: "eventually", word: "eventually", partOfSpeech: "adverb", translation: "finalmente / por fim", deceptivePortuguese: "eventualmente", correctEnglish: "occasionally", example: "After several attempts, she eventually passed the exam.", exampleTranslation: "Depois de várias tentativas, ela finalmente passou na prova." },
  { id: "expert", word: "expert", partOfSpeech: "noun", translation: "especialista / perito", deceptivePortuguese: "esperto", correctEnglish: "smart / clever", example: "They consulted an expert in cybersecurity.", exampleTranslation: "Eles consultaram um especialista em segurança cibernética." },
  { id: "exquisite", word: "exquisite", partOfSpeech: "adjective", translation: "requintado / refinado", deceptivePortuguese: "esquisito", correctEnglish: "strange / weird / odd", example: "The restaurant is known for its exquisite desserts.", exampleTranslation: "O restaurante é conhecido por suas sobremesas requintadas." },
  { id: "fabric", word: "fabric", partOfSpeech: "noun", translation: "tecido", deceptivePortuguese: "fábrica", correctEnglish: "factory / plant", example: "This shirt is made from a soft fabric.", exampleTranslation: "Esta camisa é feita de um tecido macio." },
  { id: "genial", word: "genial", partOfSpeech: "adjective", translation: "afável / cordial / agradável", deceptivePortuguese: "genial", correctEnglish: "brilliant / ingenious", example: "Our host was genial and made everyone feel welcome.", exampleTranslation: "Nosso anfitrião foi afável e fez todos se sentirem bem-vindos." },
  { id: "gratuity", word: "gratuity", partOfSpeech: "noun", translation: "gorjeta / gratificação", deceptivePortuguese: "gratuito", correctEnglish: "free / free of charge", example: "A gratuity is already included in the bill.", exampleTranslation: "Uma gorjeta já está incluída na conta." },
  { id: "ingenuity", word: "ingenuity", partOfSpeech: "noun", translation: "engenhosidade / criatividade", deceptivePortuguese: "ingenuidade", correctEnglish: "naivety / gullibility", example: "Her ingenuity helped the team solve the problem.", exampleTranslation: "A engenhosidade dela ajudou a equipe a resolver o problema." },
  { id: "injury", word: "injury", partOfSpeech: "noun", translation: "ferimento / lesão", deceptivePortuguese: "injúria", correctEnglish: "insult / offense", example: "The player returned after recovering from an injury.", exampleTranslation: "O jogador voltou depois de se recuperar de uma lesão." },
  { id: "intoxication", word: "intoxication", partOfSpeech: "noun", translation: "embriaguez / efeito de álcool ou drogas", deceptivePortuguese: "intoxicação", correctEnglish: "poisoning", example: "The driver showed signs of alcohol intoxication.", exampleTranslation: "O motorista apresentava sinais de embriaguez." },
  { id: "jar", word: "jar", partOfSpeech: "noun", translation: "pote / frasco", deceptivePortuguese: "jarra", correctEnglish: "pitcher / jug", example: "She kept the coffee in a glass jar.", exampleTranslation: "Ela guardava o café em um pote de vidro." },
  { id: "journal", word: "journal", partOfSpeech: "noun", translation: "periódico / revista especializada", deceptivePortuguese: "jornal", correctEnglish: "newspaper", example: "The study was published in a medical journal.", exampleTranslation: "O estudo foi publicado em um periódico médico." },
  { id: "lamp", word: "lamp", partOfSpeech: "noun", translation: "luminária / abajur", deceptivePortuguese: "lâmpada", correctEnglish: "light bulb", example: "I turned on the desk lamp to read.", exampleTranslation: "Acendi a luminária da mesa para ler." },
  { id: "legend", word: "legend", partOfSpeech: "noun", translation: "lenda", deceptivePortuguese: "legenda", correctEnglish: "subtitles / caption", example: "The story became a local legend.", exampleTranslation: "A história se tornou uma lenda local." },
  { id: "library", word: "library", partOfSpeech: "noun", translation: "biblioteca", deceptivePortuguese: "livraria", correctEnglish: "bookstore / bookshop", example: "I borrowed this book from the library.", exampleTranslation: "Peguei este livro emprestado na biblioteca." },
  { id: "lunch", word: "lunch", partOfSpeech: "noun", translation: "almoço", deceptivePortuguese: "lanche", correctEnglish: "snack", example: "We usually have lunch at noon.", exampleTranslation: "Normalmente almoçamos ao meio-dia." },
  { id: "magazine", word: "magazine", partOfSpeech: "noun", translation: "revista", deceptivePortuguese: "magazine (loja)", correctEnglish: "shop / store", example: "She read an article in a science magazine.", exampleTranslation: "Ela leu um artigo em uma revista científica." },
  { id: "mascara", word: "mascara", partOfSpeech: "noun", translation: "rímel / máscara para cílios", deceptivePortuguese: "máscara", correctEnglish: "mask", example: "She applied mascara before leaving.", exampleTranslation: "Ela passou rímel antes de sair." },
  { id: "notice", word: "notice", partOfSpeech: "verb", translation: "notar / perceber", deceptivePortuguese: "notícia", correctEnglish: "news", example: "Did you notice the change in the schedule?", exampleTranslation: "Você percebeu a mudança no horário?" },
  { id: "novel", word: "novel", partOfSpeech: "noun", translation: "romance / livro de ficção", deceptivePortuguese: "novela", correctEnglish: "soap opera", example: "She is reading a historical novel.", exampleTranslation: "Ela está lendo um romance histórico." },
  { id: "oration", word: "oration", partOfSpeech: "noun", translation: "discurso formal / oração solene", deceptivePortuguese: "oração (reza)", correctEnglish: "prayer", example: "The ceremony ended with a moving oration.", exampleTranslation: "A cerimônia terminou com um discurso comovente." },
  { id: "parent", word: "parent", partOfSpeech: "noun", translation: "pai ou mãe / responsável", deceptivePortuguese: "parente", correctEnglish: "relative", example: "A parent must sign the permission form.", exampleTranslation: "Um dos responsáveis deve assinar a autorização." },
  { id: "pasta", word: "pasta", partOfSpeech: "noun", translation: "massa alimentícia / macarrão", deceptivePortuguese: "pasta", correctEnglish: "folder / briefcase", example: "We ordered fresh pasta for dinner.", exampleTranslation: "Pedimos massa fresca para o jantar." },
  { id: "policy", word: "policy", partOfSpeech: "noun", translation: "política / norma / apólice", deceptivePortuguese: "polícia", correctEnglish: "police", example: "The company introduced a new privacy policy.", exampleTranslation: "A empresa introduziu uma nova política de privacidade." },
  { id: "prejudice", word: "prejudice", partOfSpeech: "noun", translation: "preconceito", deceptivePortuguese: "prejuízo", correctEnglish: "loss / damage", example: "Education can help reduce prejudice.", exampleTranslation: "A educação pode ajudar a reduzir o preconceito." },
  { id: "pretend", word: "pretend", partOfSpeech: "verb", translation: "fingir / fazer de conta", deceptivePortuguese: "pretender", correctEnglish: "intend / plan", example: "The children pretended to be astronauts.", exampleTranslation: "As crianças fingiram ser astronautas." },
  { id: "push", word: "push", partOfSpeech: "verb", translation: "empurrar", deceptivePortuguese: "puxar", correctEnglish: "pull", example: "Push the door to open it.", exampleTranslation: "Empurre a porta para abri-la." },
  { id: "realize", word: "realize", partOfSpeech: "verb", translation: "perceber / compreender", deceptivePortuguese: "realizar", correctEnglish: "carry out / accomplish", example: "I realized that I had taken the wrong train.", exampleTranslation: "Percebi que havia pegado o trem errado." },
  { id: "reclaim", word: "reclaim", partOfSpeech: "verb", translation: "recuperar / reivindicar de volta", deceptivePortuguese: "reclamar", correctEnglish: "complain / claim", example: "The city plans to reclaim the abandoned land.", exampleTranslation: "A cidade pretende recuperar o terreno abandonado." },
  { id: "record", word: "record", partOfSpeech: "verb", translation: "gravar / registrar", deceptivePortuguese: "recordar", correctEnglish: "remember / recall", example: "Please record the interview for the archive.", exampleTranslation: "Por favor, grave a entrevista para o arquivo." },
  { id: "scenario", word: "scenario", partOfSpeech: "noun", translation: "situação possível / sequência prevista de eventos", deceptivePortuguese: "cenário de teatro ou filme", correctEnglish: "setting / set", example: "We prepared a plan for the worst-case scenario.", exampleTranslation: "Preparamos um plano para a pior situação possível." },
  { id: "sensible", word: "sensible", partOfSpeech: "adjective", translation: "sensato / razoável", deceptivePortuguese: "sensível", correctEnglish: "sensitive", example: "Taking an umbrella was a sensible decision.", exampleTranslation: "Levar um guarda-chuva foi uma decisão sensata." },
  { id: "tent", word: "tent", partOfSpeech: "noun", translation: "barraca / tenda", deceptivePortuguese: "tentar", correctEnglish: "try / attempt", example: "They slept in a tent near the lake.", exampleTranslation: "Eles dormiram em uma barraca perto do lago." },
  { id: "ultimately", word: "ultimately", partOfSpeech: "adverb", translation: "em última análise / por fim", deceptivePortuguese: "ultimamente", correctEnglish: "lately / recently", example: "Ultimately, the final decision belongs to you.", exampleTranslation: "Em última análise, a decisão final cabe a você." },
  { id: "vegetables", word: "vegetables", partOfSpeech: "noun", translation: "verduras / legumes", deceptivePortuguese: "vegetais (plantas)", correctEnglish: "plants", example: "Fresh vegetables are sold at the market.", exampleTranslation: "Verduras e legumes frescos são vendidos no mercado." },
  { id: "balance", word: "balance", partOfSpeech: "noun", translation: "equilíbrio / saldo", deceptivePortuguese: "balança", correctEnglish: "scale", example: "She lost her balance on the wet floor.", exampleTranslation: "Ela perdeu o equilíbrio no chão molhado." },
  { id: "educated", word: "educated", partOfSpeech: "adjective", translation: "instruído / escolarizado", deceptivePortuguese: "educado", correctEnglish: "polite / well-mannered", example: "She is a highly educated professional.", exampleTranslation: "Ela é uma profissional altamente instruída." },
  { id: "enroll", word: "enroll", partOfSpeech: "verb", translation: "inscrever-se / matricular-se", deceptivePortuguese: "enrolar", correctEnglish: "roll / wrap", example: "You can enroll in the course online.", exampleTranslation: "Você pode se matricular no curso pela internet." },
  { id: "contest", word: "contest", partOfSpeech: "noun", translation: "concurso / competição", deceptivePortuguese: "contexto", correctEnglish: "context", example: "She won first prize in the writing contest.", exampleTranslation: "Ela ganhou o primeiro prêmio no concurso de redação." },
]

const usageGuidance: Record<string, { pt: string; en: string }> = {
  actual: { pt: "Use actual para contrastar realidade e expectativa. Para algo referente ao presente, use current.", en: "Use actual to contrast reality with what was expected or reported. Use current for something belonging to the present time." },
  agenda: { pt: "Em inglês, agenda é a pauta ou lista de assuntos de uma reunião. Para o objeto usado para anotar compromissos, use planner ou diary.", en: "In English, an agenda is a meeting's list of topics. Use planner or diary for the book or app used to organize appointments." },
  anthem: { pt: "Anthem é um hino, geralmente nacional ou institucional. Para o equipamento que recebe ou transmite sinais, use antenna ou aerial.", en: "An anthem is a national, institutional, or celebratory song. An antenna or aerial is equipment that receives or transmits signals." },
  apologize: { pt: "Use apologize quando alguém reconhece um erro e pede desculpas. Para defender ou elogiar publicamente uma ideia, use defend ou praise.", en: "Use apologize when someone admits a fault and says sorry. Use defend or praise when publicly supporting an idea or person." },
  attend: { pt: "Use attend para indicar presença em aula, reunião ou evento. Para atender uma ligação, use answer the phone.", en: "Use attend for being present at a class, meeting, or event. Use answer the phone for responding to a call." },
  balcony: { pt: "Balcony é uma plataforma externa elevada ligada a um edifício. Para a superfície de atendimento de uma loja ou cozinha, use counter.", en: "A balcony is an elevated outdoor platform attached to a building. A counter is the work or service surface in a shop or kitchen." },
  casualty: { pt: "Casualty designa uma pessoa morta ou ferida em acidente, desastre ou guerra. Para um acontecimento casual ou coincidência, use chance ou coincidence.", en: "A casualty is a person killed or injured in an accident, disaster, or war. Use chance or coincidence for an accidental occurrence." },
  cigar: { pt: "Cigar é um charuto feito com folhas de tabaco enroladas. Para o produto menor envolvido em papel, use cigarette.", en: "A cigar is rolled tobacco wrapped in tobacco leaf. A cigarette is the smaller paper-wrapped tobacco product." },
  college: { pt: "College normalmente se refere ao ensino superior. Para uma instituição de ensino fundamental ou médio, use school.", en: "College normally refers to higher education. Use school for primary or secondary education." },
  costume: { pt: "Costume é uma fantasia ou traje usado para representar um personagem ou tradição. Para um comportamento habitual, use habit ou custom.", en: "A costume is clothing worn to portray a character or tradition. Use habit or custom for a repeated behavior or social practice." },
  data: { pt: "Data é o conjunto de informações usado em análises e pesquisas. Para indicar dia, mês ou ano, use date.", en: "Data is information collected for analysis or research. Use date for a specific day, month, or year." },
  devolve: { pt: "Use devolve quando poder ou responsabilidade passa a uma autoridade inferior. Para entregar algo de volta, use return, give back ou refund.", en: "Use devolve when power or responsibility is transferred to a lower authority. Use return, give back, or refund for giving something back." },
  discussion: { pt: "Discussion é uma troca de ideias e não implica conflito. Para uma discussão com briga ou forte desacordo, use argument.", en: "A discussion is an exchange of ideas and does not imply conflict. Use argument for an angry or strongly confrontational disagreement." },
  eventually: { pt: "Eventually indica o resultado final depois de algum tempo ou esforço. Para algo que acontece de vez em quando, use occasionally.", en: "Eventually describes what happens in the end, often after time or effort. Occasionally means from time to time." },
  expert: { pt: "Expert é alguém com conhecimento especializado em uma área. Para alguém inteligente ou perspicaz, use smart ou clever.", en: "An expert has specialized knowledge or skill in a field. Smart or clever describes intelligence or quick thinking." },
  exquisite: { pt: "Exquisite elogia algo especialmente belo, delicado ou bem-feito. Para algo incomum ou estranho, use strange, weird ou odd.", en: "Exquisite praises something exceptionally beautiful, delicate, or well made. Use strange, weird, or odd for something unusual." },
  fabric: { pt: "Fabric é o material têxtil usado para produzir roupas e outros itens. Para o local onde produtos são fabricados, use factory ou plant.", en: "Fabric is textile material used to make clothes and other goods. A factory or plant is the place where goods are manufactured." },
  genial: { pt: "Em inglês, genial descreve uma pessoa cordial e agradável. Para uma ideia brilhante ou engenhosa, use brilliant ou ingenious.", en: "In English, genial describes a warm and friendly person. Use brilliant or ingenious for an exceptionally clever idea." },
  gratuity: { pt: "Gratuity é um valor dado pelo serviço, como uma gorjeta. Para algo oferecido sem cobrança, use free ou free of charge.", en: "A gratuity is money given for service, such as a tip. Use free or free of charge when no payment is required." },
  ingenuity: { pt: "Ingenuity é a capacidade criativa de encontrar soluções. Para falta de experiência ou confiança excessiva, use naivety ou gullibility.", en: "Ingenuity is creative skill in finding solutions. Naivety or gullibility describes inexperience or excessive willingness to believe others." },
  injury: { pt: "Injury é um dano físico, como uma lesão ou ferimento. Para uma ofensa verbal à honra de alguém, use insult ou offense.", en: "An injury is physical harm to the body. An insult or offense is language or behavior that disrespects someone." },
  intoxication: { pt: "Intoxication normalmente descreve o efeito de álcool ou drogas. Para doença causada por substância tóxica ou alimento contaminado, use poisoning.", en: "Intoxication commonly describes the effects of alcohol or drugs. Use poisoning for illness caused by a toxic substance or contaminated food." },
  jar: { pt: "Jar é um recipiente, geralmente cilíndrico, usado para armazenar alimentos ou objetos. Para servir água ou outra bebida, use pitcher ou jug.", en: "A jar is a container commonly used to store food or small objects. A pitcher or jug is designed for holding and pouring drinks." },
  journal: { pt: "Journal pode ser um periódico acadêmico ou um diário pessoal. Para uma publicação diária de notícias, use newspaper.", en: "A journal can be an academic periodical or a personal diary. A newspaper is a regular publication reporting current news." },
  lamp: { pt: "Lamp é a luminária completa que sustenta e fornece luz. Para apenas a peça substituível que produz luz, use light bulb.", en: "A lamp is the complete fixture that provides light. A light bulb is the replaceable part that produces the light." },
  legend: { pt: "Legend é uma história tradicional ou uma pessoa de fama extraordinária. Para o texto de vídeos, imagens ou gráficos, use subtitles ou caption.", en: "A legend is a traditional story or an exceptionally famous person. Use subtitles or caption for text accompanying video, images, or charts." },
  library: { pt: "Library é o lugar onde livros podem ser consultados ou emprestados. Para uma loja que vende livros, use bookstore ou bookshop.", en: "A library lends books or makes them available for consultation. A bookstore or bookshop sells books." },
  lunch: { pt: "Lunch é a refeição principal feita no meio do dia. Para uma pequena refeição entre horários, use snack.", en: "Lunch is the main meal eaten around the middle of the day. A snack is a small amount of food eaten between meals." },
  magazine: { pt: "Magazine é uma publicação periódica com artigos e imagens. Para um estabelecimento comercial, use shop ou store.", en: "A magazine is a periodical publication containing articles and images. A shop or store is a place where goods are sold." },
  mascara: { pt: "Mascara é o cosmético aplicado aos cílios. Para o objeto que cobre ou protege o rosto, use mask.", en: "Mascara is makeup applied to the eyelashes. A mask covers or protects part or all of the face." },
  notice: { pt: "Como verbo, notice significa perceber algo. Para uma informação sobre acontecimento recente, use news.", en: "As a verb, notice means becoming aware of something. Use news for information about recent events." },
  novel: { pt: "Novel é uma narrativa longa publicada como livro. Para uma série dramática exibida na televisão, use soap opera.", en: "A novel is a long fictional narrative published as a book. A soap opera is a continuing television drama." },
  oration: { pt: "Oration é um discurso formal feito em público. Para palavras dirigidas a uma divindade, use prayer.", en: "An oration is a formal public speech. A prayer is spoken or silent communication addressed to a deity." },
  parent: { pt: "Parent é especificamente o pai, a mãe ou responsável de alguém. Para outros membros da família, use relative.", en: "A parent is specifically someone's mother, father, or guardian. Use relative for other members of a family." },
  pasta: { pt: "Pasta é uma massa alimentícia, como espaguete ou penne. Para organizar documentos, use folder; para uma pasta executiva, use briefcase.", en: "Pasta is food such as spaghetti or penne. Use folder for organizing documents and briefcase for a case used to carry work materials." },
  policy: { pt: "Policy é uma regra, diretriz ou apólice estabelecida por uma organização. Para a instituição de segurança pública, use police.", en: "A policy is a rule, guideline, or insurance contract. The police are the public organization responsible for law enforcement." },
  prejudice: { pt: "Prejudice é um julgamento negativo feito sem conhecimento adequado. Para dano material ou financeiro, use damage ou loss.", en: "Prejudice is an unfair judgment formed without sufficient knowledge. Use damage or loss for material or financial harm." },
  pretend: { pt: "Pretend significa agir como se algo fosse verdade, mesmo não sendo. Para expressar uma intenção ou plano, use intend ou plan.", en: "Pretend means acting as though something were true when it is not. Use intend or plan for something you aim to do." },
  push: { pt: "Push é aplicar força para afastar algo de você. Para trazer algo em sua direção, use pull.", en: "Push means applying force to move something away from you. Pull means moving it toward you." },
  realize: { pt: "Realize normalmente significa perceber ou compreender um fato. Para executar um projeto ou alcançar um objetivo, use carry out ou accomplish.", en: "Realize commonly means becoming aware of or understanding a fact. Use carry out or accomplish for completing a project or goal." },
  reclaim: { pt: "Reclaim é recuperar algo perdido ou tornar uma área novamente utilizável. Para manifestar insatisfação, use complain.", en: "Reclaim means recovering something lost or making land usable again. Use complain to express dissatisfaction." },
  record: { pt: "Como verbo, record é registrar som, imagem ou informação. Para trazer algo de volta à memória, use remember ou recall.", en: "As a verb, record means capturing sound, images, or information. Use remember or recall for bringing something back to mind." },
  scenario: { pt: "Scenario descreve uma situação possível ou sequência prevista de eventos. Para o ambiente de uma história ou montagem de palco, use setting ou set.", en: "A scenario is a possible situation or projected sequence of events. Use setting or set for the environment of a story or stage production." },
  sensible: { pt: "Sensible descreve uma decisão prática e baseada em bom senso. Para alguém afetado facilmente por emoções ou estímulos, use sensitive.", en: "Sensible describes a practical decision based on good judgment. Sensitive describes someone easily affected by emotions or stimuli." },
  tent: { pt: "Tent é um abrigo portátil feito de tecido. Para fazer uma tentativa, use try ou attempt.", en: "A tent is a portable fabric shelter. Use try or attempt for making an effort to do something." },
  ultimately: { pt: "Ultimately apresenta a conclusão ou resultado final de uma situação. Para algo ocorrido em período recente, use lately ou recently.", en: "Ultimately introduces the final result or conclusion of a situation. Use lately or recently for events in the recent past." },
  vegetables: { pt: "Vegetables são alimentos vegetais, como cenoura, brócolis e alface. Para seres vivos do reino vegetal de modo geral, use plants.", en: "Vegetables are edible plants or plant parts such as carrots and broccoli. Use plants for members of the plant kingdom in general." },
  balance: { pt: "Balance é estabilidade, equilíbrio ou o valor restante em uma conta. Para o instrumento usado para pesar, use scale.", en: "Balance is stability, equilibrium, or an amount remaining in an account. A scale is an instrument used for weighing." },
  educated: { pt: "Educated descreve alguém que recebeu formação ou possui conhecimento. Para alguém com boas maneiras, use polite ou well-mannered.", en: "Educated describes someone with schooling or substantial knowledge. Polite or well-mannered describes courteous behavior." },
  enroll: { pt: "Enroll é registrar alguém oficialmente em um curso ou programa. Para enrolar fisicamente um objeto, use roll ou wrap.", en: "Enroll means officially registering someone in a course or program. Use roll or wrap for physically winding or covering an object." },
  contest: { pt: "Contest é uma competição em que participantes disputam um prêmio. Para as circunstâncias que ajudam a compreender algo, use context.", en: "A contest is a competition in which participants compete for a prize. Context is the surrounding information needed to understand something." },
}

function splitGuidance(value: string) {
  const boundary = value.indexOf(". ")
  if (boundary < 0) return { context: value, contrast: "" }
  return { context: value.slice(0, boundary + 1), contrast: value.slice(boundary + 2) }
}

export const VOCAB_FALSE_COGNATES_CATALOG: readonly VocabFalseCognatesCatalogEntry[] = source.map((entry) => ({
  catalogId: `false-cognate-${entry.id}`,
  catalogRevision: 3,
  word: entry.word,
  partOfSpeech: entry.partOfSpeech,
  grammaticalForm: "base-form",
  translation: entry.translation,
  ipa: "",
  usageNote: splitGuidance(usageGuidance[entry.id].pt).context,
  usageNoteEn: splitGuidance(usageGuidance[entry.id].en).context,
  synonyms: [],
  antonyms: [],
  example: entry.example,
  exampleTranslation: entry.exampleTranslation,
  alternativeForms: [],
  falseCognate: {
    isFalseCognate: true,
    warning: splitGuidance(usageGuidance[entry.id].pt).contrast,
    warningEn: splitGuidance(usageGuidance[entry.id].en).contrast,
  },
  familyKey: entry.word,
  usageStatus: "current",
}))

function hashContent(content: unknown) {
  let hash = 2166136261
  for (const char of JSON.stringify(content)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

function catalogHashContent(entry: VocabFalseCognatesCatalogEntry | Flashcard) {
  return { word: entry.word, partOfSpeech: entry.partOfSpeech, grammaticalForm: entry.grammaticalForm ?? "base-form", translation: entry.translation, ipa: entry.ipa ?? "", usageNote: entry.usageNote ?? "", usageNoteEn: entry.usageNoteEn ?? "", synonyms: entry.synonyms, antonyms: entry.antonyms, example: entry.example, exampleTranslation: entry.exampleTranslation ?? "", alternativeForms: entry.alternativeForms, conjugations: entry.conjugations ?? null, verbType: entry.verbType ?? null, falseCognate: entry.falseCognate ?? null, familyKey: entry.familyKey ?? "", usageStatus: entry.usageStatus ?? "current" }
}

export function vocabFalseCognatesContentHash(entry: VocabFalseCognatesCatalogEntry | Flashcard) {
  return hashContent(catalogHashContent(entry))
}

export function validateVocabFalseCognatesCatalog() {
  const ids = new Set<string>()
  const words = new Set<string>()
  for (const entry of VOCAB_FALSE_COGNATES_CATALOG) {
    if (!entry.catalogId || ids.has(entry.catalogId)) throw new Error(`Invalid or duplicate false-cognate catalog id: ${entry.catalogId}`)
    ids.add(entry.catalogId)
    const key = `${entry.word.toLowerCase()}__${entry.partOfSpeech}`
    if (words.has(key)) throw new Error(`Duplicate false-cognate catalog entry: ${key}`)
    words.add(key)
    if (![entry.word, entry.translation, entry.usageNote, entry.usageNoteEn, entry.example, entry.exampleTranslation, entry.falseCognate?.warning, entry.falseCognate?.warningEn].every((value) => value?.trim())) throw new Error(`Incomplete false-cognate catalog entry: ${entry.catalogId}`)
    if (!/^[a-z][a-z '-]*$/i.test(entry.word)) throw new Error(`Non-English headword in false-cognate catalog: ${entry.word}`)
    if (!entry.falseCognate?.isFalseCognate) throw new Error(`Missing false-cognate warning: ${entry.catalogId}`)
    if (entry.example.split(/\s+/).length < 4 || !/[.!?]$/.test(entry.example)) throw new Error(`Structurally invalid false-cognate example: ${entry.catalogId}`)
  }
}
