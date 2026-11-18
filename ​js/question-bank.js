import { db, ref, get, update, serverTimestamp } from "./firebase-config.js";

// Raw compact question rows extracted directly from bible_questions_database-v2.xlsx
// Format: id|testament|category|keywords|question|optA|optB|optC|optD|correctOpt|correctAnswer
const RAW_BIBLE_QUESTIONS = [
  "1|Old Testament|Genesis & Patriarchs|creation, day 1, light, genesis|What did God create on the first day according to Genesis 1?|Dry land and seas|Light|The sun and moon|Living creatures|B|Light",
  "2|Old Testament|Genesis & Patriarchs|eden, adam, eve, forbidden fruit, tree|Which tree in the Garden of Eden were Adam and Eve forbidden to eat from?|Tree of Life|Tree of Wisdom|Tree of the Knowledge of Good and Evil|Tree of Righteousness|C|Tree of the Knowledge of Good and Evil",
  "3|Old Testament|Genesis & Patriarchs|cain, abel, murder, genesis|Who was the first murderer mentioned in the Bible?|Lamech|Cain|Esau|Nimrod|B|Cain",
  "4|Old Testament|Genesis & Patriarchs|noah, flood, ark, rain, 40 days|How many days and nights did it rain during the Great Flood in Noah's time?|7|30|40|150|C|40",
  "5|Old Testament|Genesis & Patriarchs|noah, covenant, rainbow, flood|What sign did God place in the sky as a covenant never to flood the entire earth again?|A bright star|A rainbow|A pillar of cloud|A dove|B|A rainbow",
  "6|Old Testament|Genesis & Patriarchs|tower of babel, languages, genesis|Which city had a tower built by people trying to reach the heavens before God confused their languages?|Nineveh|Jericho|Babel|Sodom|C|Babel",
  "7|Old Testament|Genesis & Patriarchs|abraham, abram, name change, patriarch|What was Abraham's original name before God changed it?|Abram|Abimelech|Abner|Absalom|A|Abram",
  "8|Old Testament|Genesis & Patriarchs|sarah, abraham, isaac, birth|Who was Abraham's wife who gave birth to Isaac in her old age?|Rebekah|Rachel|Sarah|Leah|C|Sarah",
  "9|Old Testament|Genesis & Patriarchs|esau, jacob, birthright, red stew|What did Esau sell his birthright to Jacob for?|Thirty pieces of silver|A bowl of red stew|A flock of sheep|A coat of many colors|B|A bowl of red stew",
  "10|Old Testament|Genesis & Patriarchs|joseph, jacob, brothers, slavery, egypt|Which son of Jacob was sold into slavery in Egypt by his brothers?|Benjamin|Judah|Reuben|Joseph|D|Joseph",
  "11|Old Testament|Exodus, Conquest & Judges|moses, ten commandments, mount sinai, law|Where did Moses receive the Ten Commandments from God?|Mount Carmel|Mount Sinai|Mount Nebo|Mount Zion|B|Mount Sinai",
  "12|Old Testament|Exodus, Conquest & Judges|plagues, egypt, pharaoh, passover, firstborn|What was the final plague that convinced Pharaoh to let the Israelites leave Egypt?|Darkness for three days|Locusts|Death of the firstborn|Water turning to blood|C|Death of the firstborn",
  "13|Old Testament|Exodus, Conquest & Judges|red sea, exodus, moses, egyptian army|Which sea did God part so the Israelites could escape the Egyptian army?|Dead Sea|Sea of Galilee|Red Sea|Mediterranean Sea|C|Red Sea",
  "14|Old Testament|Exodus, Conquest & Judges|joshua, moses, promised land, leader|Who succeeded Moses as the leader of Israel and led them into the Promised Land?|Caleb|Aaron|Joshua|Gideon|C|Joshua",
  "15|Old Testament|Exodus, Conquest & Judges|jericho, walls, march, seven times, joshua|How many times did the Israelites march around Jericho on the seventh day before its walls fell?|Once|Three times|Seven times|Twelve times|C|Seven times",
  "16|Old Testament|Exodus, Conquest & Judges|samson, judge, hair, strength, delilah|Which Israelite judge lost his supernatural strength when his hair was cut?|Gideon|Samson|Jephthah|Ehud|B|Samson",
  "17|Old Testament|Exodus, Conquest & Judges|ruth, naomi, moabite, david ancestor|Who was the Moabite woman who stayed loyal to her mother-in-law Naomi and became an ancestor of King David?|Esther|Rahab|Ruth|Deborah|C|Ruth",
  "18|Old Testament|Kings & History of Israel|saul, first king, israel, monarchy|Who was the first king of Israel?|David|Solomon|Saul|Samuel|C|Saul",
  "19|Old Testament|Kings & History of Israel|david, goliath, sling, stone, philistine|What weapon did David use to defeat the Philistine giant Goliath?|A bronze sword|A spear|A sling and a stone|A bow and arrow|C|A sling and a stone",
  "20|Old Testament|Kings & History of Israel|solomon, wisdom, first temple, jerusalem|Which king of Israel was renowned for his wisdom and built the First Temple in Jerusalem?|Hezekiah|Josiah|Solomon|Rehoboam|C|Solomon",
  "21|Old Testament|Kings & History of Israel|esther, queen, persia, haman, purim|Which Jewish queen of Persia saved her people from a plot orchestrated by Haman?|Vashti|Esther|Judith|Miriam|B|Esther",
  "22|Old Testament|Kings & History of Israel|nehemiah, jerusalem walls, exile, rebuilding|Who led the rebuilding of Jerusalem's walls after the Babylonian exile?|Ezra|Zerubbabel|Nehemiah|Haggai|C|Nehemiah",
  "23|Old Testament|Wisdom & Poetry|job, suffering, patience, faithfulness|Which man in the Old Testament remained faithful to God despite losing his wealth, children, and health?|Job|Enoch|Lot|Hosea|A|Job",
  "24|Old Testament|Wisdom & Poetry|david, psalms, author, worship|Who wrote the majority of the Book of Psalms?|Solomon|Moses|David|Asaph|C|David",
  "25|Old Testament|Wisdom & Poetry|psalm 23, shepherd, david, poetry|How does Psalm 23 begin?|\"In the beginning God created...\"|\"The Lord is my shepherd; I shall not want.\"|\"Blessed is the man...\"|\"Make a joyful noise unto the Lord.\"|B|\"The Lord is my shepherd; I shall not want.\"",
  "26|Old Testament|Wisdom & Poetry|proverbs, fear of the lord, knowledge, wisdom|According to the Book of Proverbs, what is \"the beginning of knowledge\"?|Seeking wealth|The fear of the Lord|Listening to elders|Studying the law|B|The fear of the Lord",
  "27|Old Testament|Wisdom & Poetry|ecclesiastes, season, time, purpose|Which Old Testament book contains the famous passage \"To everything there is a season, and a time to every purpose under heaven\"?|Proverbs|Song of Solomon|Ecclesiastes|Lamentations|C|Ecclesiastes",
  "28|Old Testament|Old Testament Prophets|elijah, mount carmel, baal, fire|Which prophet challenged the prophets of Baal on Mount Carmel?|Elisha|Elijah|Isaiah|Jeremiah|B|Elijah",
  "29|Old Testament|Old Testament Prophets|elijah, whirlwind, chariots of fire, heaven|How did the prophet Elijah depart from the earth?|He died in Jerusalem|He was taken up in a whirlwind with chariots of fire|He disappeared on Mount Sinai|He drowned in the Jordan River|B|He was taken up in a whirlwind with chariots of fire",
  "30|Old Testament|Old Testament Prophets|naaman, leprosy, jordan river, elisha|Which commander of the Syrian army was cured of leprosy after dipping seven times in the Jordan River?|Naaman|Ben-Hadad|Hazael|Sisera|A|Naaman",
  "31|Old Testament|Old Testament Prophets|isaiah, throne, seraphim, vision|Which prophet saw the Lord seated on a high and exalted throne surrounded by six-winged seraphim?|Ezekiel|Isaiah|Daniel|Amos|B|Isaiah",
  "32|Old Testament|Old Testament Prophets|micah, bethlehem, messiah prophecy|Which prophet foretold that the Messiah would be born in Bethlehem?|Micah|Malachi|Nahum|Habakkuk|A|Micah",
  "33|Old Testament|Old Testament Prophets|jeremiah, weeping prophet, babylon, judah|Who is known as the \"weeping prophet\" who warned Judah of Jerusalem's impending destruction by Babylon?|Hosea|Jeremiah|Joel|Zephaniah|B|Jeremiah",
  "34|Old Testament|Old Testament Prophets|ezekiel, valley of dry bones, vision|Which prophet had a vision of a valley of dry bones coming back to life?|Daniel|Zechariah|Ezekiel|Obadiah|C|Ezekiel",
  "35|Old Testament|Old Testament Prophets|nebuchadnezzar, statue dream, daniel, babylon|Which Babylonian king had a dream of a giant statue made of gold, silver, bronze, iron, and clay?|Belshazzar|Cyrus|Darius|Nebuchadnezzar|D|Nebuchadnezzar",
  "36|Old Testament|Old Testament Prophets|shadrach, meshach, abednego, fiery furnace, daniel|What were the names of Daniel's three friends who survived the fiery furnace?|Peter, James, and John|Shadrach, Meshach, and Abednego|Shem, Ham, and Japheth|Korah, Dathan, and Abiram|B|Shadrach, Meshach, and Abednego",
  "37|Old Testament|Old Testament Prophets|daniel, lions den, prayer, decree|Why was Daniel thrown into the lions' den?|He refused to eat the king's food|He continued praying to God despite a royal decree|He interpreted handwriting on the wall|He refused to bow to a golden statue|B|He continued praying to God despite a royal decree",
  "38|Old Testament|Old Testament Prophets|belshazzar, handwriting on the wall, daniel|What appeared at King Belshazzar's feast to pronounce judgment on his kingdom?|An angel with a flaming sword|A disembodied hand writing on the wall|A sudden earthquake|A cloud of locusts|B|A disembodied hand writing on the wall",
  "39|Old Testament|Old Testament Prophets|hosea, gomer, marriage, unfaithfulness|Which prophet was instructed by God to marry an unfaithful woman named Gomer to symbolize Israel's unfaithfulness?|Amos|Hosea|Joel|Micah|B|Hosea",
  "40|Old Testament|Old Testament Prophets|jonah, tarshish, nineveh, ship|Which prophet fled toward Tarshish by ship instead of preaching to Nineveh?|Jonah|Nahum|Haggai|Malachi|A|Jonah",
  "41|Old Testament|Old Testament Prophets|jonah, great fish, three days, nineveh|How long was Jonah inside the belly of the great fish?|One day and one night|Three days and three nights|Seven days|Forty days|B|Three days and three nights",
  "42|Old Testament|Old Testament Prophets|joel, spirit, pentecost prophecy, minor prophet|Which Minor Prophet prophesied that God would \"pour out My Spirit on all flesh\"?|Obadiah|Joel|Zephaniah|Haggai|B|Joel",
  "43|Old Testament|Old Testament Prophets|amos, shepherd, fig-tree dresser, occupation|What was the occupation of the prophet Amos before God called him?|Fisherman|Tax collector|Shepherd and fig-tree dresser|Temple priest|C|Shepherd and fig-tree dresser",
  "44|Old Testament|Old Testament Prophets|obadiah, shortest book, old testament, one chapter|Which is the shortest book in the Old Testament, consisting of only one chapter?|Haggai|Nahum|Obadiah|Malachi|C|Obadiah",
  "45|Old Testament|Old Testament Prophets|haggai, rebuild temple, paneled houses, exiles|Which prophet urged the returning exiles to prioritize rebuilding the Lord's Temple over their own paneled houses?|Haggai|Habakkuk|Jonah|Amos|A|Haggai",
  "46|Old Testament|Old Testament Prophets|malachi, last book, old testament|Which book closes the Old Testament in standard Christian Bibles?|Zechariah|Malachi|Hosea|Joel|B|Malachi",
  "47|Old Testament|Old Testament Prophets|isaiah 53, suffering servant, iniquities, transgressions|According to Isaiah 53, the Suffering Servant was \"wounded for our transgressions\" and \"bruised for our...\" what?|Rebellions|Iniquities|Weaknesses|Doubts|B|Iniquities",
  "48|Old Testament|Old Testament Prophets|daniel, vegetables and water, ten-day test, babylon|What food did Daniel and his companions request during their ten-day test in Babylon?|Bread and honey|Vegetables and water|Fish and unleavened bread|Figs and milk|B|Vegetables and water",
  "49|Old Testament|Old Testament Prophets|habakkuk, just shall live by faith|Which prophet recorded the statement \"The just shall live by his faith\"?|Habakkuk|Nahum|Zephaniah|Malachi|A|Habakkuk",
  "50|Old Testament|Old Testament Prophets|zechariah, donkey, palm sunday, king enters jerusalem|According to Zechariah 9:9, how would Zion's coming King enter Jerusalem?|On a white warhorse|In a golden chariot|Riding on a donkey|Carried on a litter|C|Riding on a donkey",
  "51|New Testament|Life & Miracles of Jesus|gospels, matthew, mark, luke, john|Which four books make up the New Testament Gospels?|Matthew, Mark, Luke, and Acts|Matthew, Mark, Luke, and John|Mark, Luke, John, and Romans|Matthew, John, Romans, and Hebrews|B|Matthew, Mark, Luke, and John",
  "52|New Testament|Life & Miracles of Jesus|gabriel, angel, mary, annunciation|Which angel announced to Mary that she would conceive and give birth to Jesus?|Michael|Raphael|Gabriel|Uriel|C|Gabriel",
  "53|New Testament|Life & Miracles of Jesus|bethlehem, birth of jesus, nativity|In which town was Jesus born?|Nazareth|Capernaum|Bethlehem|Bethany|C|Bethlehem",
  "54|New Testament|Life & Miracles of Jesus|magi, wise men, gold, frankincense, myrrh|What gifts did the Magi (Wise Men) bring to the young Jesus?|Silver, bronze, and silk|Gold, frankincense, and myrrh|Olive oil, wine, and wheat|Gold, emeralds, and spices|B|Gold, frankincense, and myrrh",
  "55|New Testament|Life & Miracles of Jesus|john the baptist, baptism, jordan river, jesus|Who baptized Jesus in the Jordan River?|Peter|John the Baptist|Andrew|Nicodemus|B|John the Baptist",
  "56|New Testament|Life & Miracles of Jesus|wilderness, fasting, 40 days, temptation, satan|How many days did Jesus fast in the wilderness while being tempted by Satan?|7|12|30|40|D|40",
  "57|New Testament|Life & Miracles of Jesus|first miracle, water into wine, cana, john|What was Jesus's first recorded miracle in the Gospel of John?|Healing a blind man|Walking on water|Turning water into wine at Cana|Feeding 5,000 people|C|Turning water into wine at Cana",
  "58|New Testament|Life & Miracles of Jesus|peter, andrew, fishermen, disciples|What were the occupations of Simon Peter and his brother Andrew before following Jesus?|Tax collectors|Carpenters|Fishermen|Tentmakers|C|Fishermen",
  "59|New Testament|Life & Miracles of Jesus|zacchaeus, sycamore tree, tax collector, jericho|Which tax collector climbed a sycamore-fig tree to see Jesus pass through Jericho?|Matthew|Zacchaeus|Bartimaeus|Levi|B|Zacchaeus",
  "60|New Testament|Life & Miracles of Jesus|feeding 5000, five loaves, two fish, miracle|How many loaves and fish did Jesus use to feed the multitude of 5,000 men?|Seven loaves and a few small fish|Five loaves and two fish|Three loaves and five fish|Two loaves and five fish|B|Five loaves and two fish",
  "61|New Testament|Life & Miracles of Jesus|peter, walking on water, sea of galilee, faith|Which disciple walked on water toward Jesus before beginning to sink out of fear?|John|Thomas|Peter|James|C|Peter",
  "62|New Testament|Life & Miracles of Jesus|lazarus, raised from dead, four days, bethany|Which friend did Jesus raise from the dead after he had been in the tomb for four days?|Jairus|Lazarus|Nicodemus|Stephen|B|Lazarus",
  "63|New Testament|Life & Miracles of Jesus|transfiguration, moses, elijah, jesus|Which two Old Testament figures appeared alongside Jesus during the Transfiguration?|Abraham and Isaac|David and Solomon|Moses and Elijah|Isaiah and Jeremiah|C|Moses and Elijah",
  "64|New Testament|Life & Miracles of Jesus|shortest verse, john 11:35, jesus wept|What is the shortest verse in most English translations of the Bible (John 11:35)?|\"God is love.\"|\"Rejoice always.\"|\"Jesus wept.\"|\"Pray without ceasing.\"|C|\"Jesus wept.\"",
  "65|New Testament|Teachings & Parables of Jesus|sermon on the mount, salt and light, matthew 5|In the Sermon on the Mount, what did Jesus call believers in Matthew 5:13–14?|The sword and shield|The salt of the earth and light of the world|The vine and the branches|The shepherds and the flock|B|The salt of the earth and light of the world",
  "66|New Testament|Teachings & Parables of Jesus|good samaritan, parable, priest, levite|In the Parable of the Good Samaritan, which two religious figures passed by the injured man before the Samaritan helped him?|A Pharisee and a Sadducee|A priest and a Levite|A scribe and a rabbi|A high priest and a tax collector|B|A priest and a Levite",
  "67|New Testament|Teachings & Parables of Jesus|prodigal son, parable, robe, ring, sandals|In the Parable of the Prodigal Son, what did the father give his returning younger son?|A bag of gold|The best robe, a ring, and sandals|Half of the remaining farm|A chariot and horses|B|The best robe, a ring, and sandals",
  "68|New Testament|Teachings & Parables of Jesus|great commission, disciples, all nations, matthew 28|What final command did Jesus give His disciples in Matthew 28:19–20, known as the Great Commission?|Build a temple in Jerusalem|Go and make disciples of all nations|Write down all His parables|Fast and wait in Galilee|B|Go and make disciples of all nations",
  "69|New Testament|Crucifixion & Resurrection|judas iscariot, betrayal, thirty pieces of silver|Which disciple betrayed Jesus to the chief priests for thirty pieces of silver?|Judas Iscariot|Simon the Zealot|Thomas|Bartholomew|A|Judas Iscariot",
  "70|New Testament|Crucifixion & Resurrection|gethsemane, prayer, night before crucifixion|Where did Jesus pray in agony on the night before His crucifixion?|Garden of Eden|Garden of Gethsemane|Mount of Olives|Pool of Bethesda|B|Garden of Gethsemane",
  "71|New Testament|Crucifixion & Resurrection|peter, denial, three times, rooster|How many times did Peter deny knowing Jesus before the rooster crowed?|Once|Twice|Three times|Seven times|C|Three times",
  "72|New Testament|Crucifixion & Resurrection|pontius pilate, roman governor, trial, crucifixion|Which Roman governor sentenced Jesus to be crucified?|Herod Antipas|Pontius Pilate|Felix|Festus|B|Pontius Pilate",
  "73|New Testament|Crucifixion & Resurrection|simon of cyrene, cross, golgotha|Who was forced by Roman soldiers to carry Jesus's cross on the way to Golgotha?|Joseph of Arimathea|Simon of Cyrene|Nicodemus|Barabbas|B|Simon of Cyrene",
  "74|New Testament|Crucifixion & Resurrection|mary magdalene, resurrection, first witness, empty tomb|Who was the first person to see the risen Jesus according to the Gospel of John?|Simon Peter|Mary Magdalene|John the Apostle|Thomas|B|Mary Magdalene",
  "75|New Testament|Crucifixion & Resurrection|thomas, doubting, wounds, resurrection|Which disciple refused to believe Jesus had risen until he saw and touched His wounds?|Philip|Andrew|Thomas|Matthew|C|Thomas",
  "76|New Testament|Acts & The Early Church|luke, author, gospel of luke, acts|Who wrote both the Gospel of Luke and the Book of Acts?|Paul|Luke|Barnabas|Mark|B|Luke",
  "77|New Testament|Acts & The Early Church|pentecost, holy spirit, acts 2, tongues of fire|On which Jewish festival day did the Holy Spirit descend upon the apostles in Acts 2?|Passover|Yom Kippur|Pentecost|Purim|C|Pentecost",
  "78|New Testament|Acts & The Early Church|matthias, twelfth apostle, replace judas|Who was chosen by lot to replace Judas Iscariot among the twelve apostles?|Barnabas|Silas|Matthias|Timothy|C|Matthias",
  "79|New Testament|Acts & The Early Church|stephen, first martyr, stoned, jerusalem|Who was the first Christian martyr, stoned to death in Jerusalem?|James|Stephen|Philip|Barnabas|B|Stephen",
  "80|New Testament|Acts & The Early Church|saul, paul, road to damascus, conversion|On which road was Saul of Tarsus blinded by a bright light and encountered the risen Jesus?|Road to Emmaus|Road to Jericho|Road to Damascus|Road to Antioch|C|Road to Damascus",
  "81|New Testament|Acts & The Early Church|cornelius, gentile convert, peter, centurion|Which Roman centurion became the first Gentile convert baptized by Peter in Acts 10?|Julius|Cornelius|Sergius Paulus|Claudius Lysias|B|Cornelius",
  "82|New Testament|Acts & The Early Church|antioch, christians, first called, early church|In which city were followers of Jesus first called \"Christians\"?|Jerusalem|Rome|Antioch|Corinth|C|Antioch",
  "83|New Testament|Acts & The Early Church|paul, tentmaking, trade, missionary|What trade did the Apostle Paul practice to support himself during his missionary journeys?|Carpentry|Fishing|Tentmaking|Pottery|C|Tentmaking",
  "84|New Testament|Acts & The Early Church|malta, shipwreck, paul, voyage to rome|On which island was Paul shipwrecked on his voyage to Rome?|Cyprus|Crete|Malta|Patmos|C|Malta",
  "85|New Testament|New Testament Epistles|romans 3:23, sinned, glory of god|According to Romans 3:23, \"for all have sinned and fall short of...\" what?|Eternal life|The glory of God|The law of Moses|Perfect peace|B|The glory of God",
  "86|New Testament|New Testament Epistles|1 corinthians 13, love chapter, paul|Which chapter of 1 Corinthians is famously known as the \"Love Chapter\"?|Chapter 10|Chapter 12|Chapter 13|Chapter 15|C|Chapter 13",
  "87|New Testament|New Testament Epistles|faith, hope, love, 1 corinthians 13:13|According to 1 Corinthians 13:13, which three virtues remain, with love being the greatest?|Joy, peace, and patience|Faith, hope, and love|Wisdom, knowledge, and understanding|Grace, mercy, and truth|B|Faith, hope, and love",
  "88|New Testament|New Testament Epistles|fruit of the spirit, galatians 5, nine|How many components make up the \"Fruit of the Spirit\" listed in Galatians 5:22–23?|Seven|Nine|Ten|Twelve|B|Nine",
  "89|New Testament|New Testament Epistles|armor of god, sword of the spirit, word of god, ephesians 6|Which piece of the \"Armor of God\" in Ephesians 6 represents the Word of God?|The shield of faith|The helmet of salvation|The sword of the Spirit|The breastplate of righteousness|C|The sword of the Spirit",
  "90|New Testament|New Testament Epistles|philemon, onesimus, paul, letter|Which New Testament letter is a personal plea from Paul to a slave owner on behalf of a runaway slave named Onesimus?|Titus|Philemon|Jude|2 Timothy|B|Philemon",
  "91|New Testament|New Testament Epistles|hebrews 11:1, faith, substance, things not seen|According to Hebrews 11:1, faith is \"the substance of things hoped for, the evidence of...\" what?|Miracles performed|Things not seen|Prayers answered|Righteous living|B|Things not seen",
  "92|New Testament|New Testament Epistles|james, faith without works is dead|Which New Testament book states that \"faith without works is dead\"?|Romans|Galatians|James|1 Peter|C|James",
  "93|New Testament|New Testament Epistles|1 john 4:8, god is love|What does 1 John 4:8 declare God to be?|A consuming fire|Love|The Alpha and Omega|The Light of the World|B|Love",
  "94|New Testament|Book of Revelation|john, revelation, patmos, exile|Who wrote the Book of Revelation while exiled on the island of Patmos?|Paul|Peter|John|Jude|C|John",
  "95|New Testament|Book of Revelation|seven churches, asia minor, revelation|To how many churches in Asia Minor are the opening letters of Revelation addressed?|Three|Five|Seven|Twelve|C|Seven",
  "96|New Testament|Book of Revelation|four horsemen, apocalypse, white, red, black, pale|What are the colors of the four horses of the Apocalypse in Revelation 6?|White, red, black, and pale|White, gold, crimson, and gray|Black, blue, red, and white|Silver, red, green, and black|A|White, red, black, and pale",
  "97|New Testament|Book of Revelation|666, number of the beast, revelation 13|What number is identified in Revelation 13:18 as the \"number of the beast\"?|333|616|666|777|C|666",
  "98|New Testament|Book of Revelation|alpha and omega, first and last, revelation 22|In Revelation 22:13, what two Greek letters does Jesus use to describe Himself as the First and the Last?|Beta and Omega|Alpha and Omega|Alpha and Sigma|Delta and Omega|B|Alpha and Omega",
  "99|New Testament|Book of Revelation|river of the water of life, new jerusalem, revelation 22|What flows from the throne of God and of the Lamb down the middle of the great street of the New Jerusalem in Revelation 22?|A stream of liquid gold|The river of the water of life|A river of milk and honey|A stream of anointing oil|B|The river of the water of life",
  "100|New Testament|Book of Revelation|amen, last word of bible, revelation 22:21|What is the very last word of the Book of Revelation (and the entire Bible) in most English translations?|Hallelujah|Forever|Amen|Peace|C|Amen"
];

// Curated Telugu Script, Telugu Transliteration, and concise English variants for all 100 questions
const TRILINGUAL_VARIANTS = {
  1: ["వెలుగు", "velugu", "light"],
  2: ["మంచి చెడ్డల తెలివినిచ్చు వృక్షము", "manchi cheddala telivinichu vrukshamu", "tree of knowledge of good and evil", "knowledge of good and evil"],
  3: ["కయీను", "kayinu", "kayeenu"],
  4: ["forty", "40 days", "నలభై", "nalabhai"],
  5: ["rainbow", "ఇంద్రధనస్సు", "ధనుస్సు", "indradhanassu", "dhanassu"],
  6: ["బాబెలు", "babelu", "tower of babel"],
  7: ["అబ్రాము", "abramu"],
  8: ["శారా", "sara", "saara"],
  9: ["red stew", "bowl of stew", "stew", "lentil stew", "ఎర్రని కూర", "చిక్కుడు కూర", "errani kura"],
  10: ["యోసేపు", "yosepu", "josepu"],
  11: ["sinai", "mt sinai", "సీనాయి కొండ", "సీనాయి పర్వతము", "sinai konda", "seenayi"],
  12: ["firstborn", "death of firstborn", "తొలిచూలు మరణం", "పెద్ద కుమారుల మరణం", "tholichoolu"],
  13: ["ఎర్ర సముద్రము", "erra samudram", "erra samudramu"],
  14: ["యెహోషువ", "yehoshuva", "yehoshua"],
  15: ["7", "seven", "7 times", "ఏడు సార్లు", "edu sarlu", "yedu sarlu"],
  16: ["సంసోను", "samsonu"],
  17: ["రూతు", "ruthu", "roothu"],
  18: ["సౌలు", "saulu", "soulu"],
  19: ["sling and stone", "sling", "slingshot", "ఒడిసెల రాయి", "ఒడిసెల", "odisela", "odisela rayi"],
  20: ["సొలొమోను", "solomonu"],
  21: ["ఎస్తేరు", "estheru", "esteru"],
  22: ["నెహెమ్యా", "nehemya"],
  23: ["యోబు", "yobu"],
  24: ["దావీదు", "davidu", "daaveedu"],
  25: ["the lord is my shepherd i shall not want", "the lord is my shepherd", "యెహోవా నా కాపరి", "yehova na kapari"],
  26: ["fear of the lord", "యెహోవా యందు భయభక్తులు", "yehova yandu bhayabhaktulu"],
  27: ["ప్రసంగి", "prasangi"],
  28: ["ఏలీయా", "eliya", "yeliya"],
  29: ["whirlwind with chariots of fire", "chariots of fire", "whirlwind", "అగ్ని రథము", "సుడిగాలి", "agni rathamu", "sudigali"],
  30: ["నయమాను", "nayamanu", "naamanu"],
  31: ["యెషయా", "yeshaya"],
  32: ["మీకా", "mika", "meeka"],
  33: ["యిర్మీయా", "yirmiya", "yirmeeya"],
  34: ["యెహెజ్కేలు", "yehezkelu"],
  35: ["నెబుకద్నెజరు", "nebukadnezaru", "nebuchadnezzaru"],
  36: ["shadrach meshach abednego", "షద్రకు మేషకు అబేద్నెగో", "shadraku meshaku abednego"],
  37: ["praying to god", "he prayed to god", "prayer", "ప్రార్థన", "prarthana"],
  38: ["handwriting on the wall", "hand writing on the wall", "a hand writing on the wall", "గోడ మీద వ్రాసిన చేయి", "goda meeda vrasina cheyi"],
  39: ["హోషేయ", "hosheya"],
  40: ["యోనా", "yona"],
  41: ["3 days and 3 nights", "three days", "3 days", "మూడు రాత్రులు మూడు పగళ్లు", "moodu dinalu", "3 rojulu"],
  42: ["యోవేలు", "yovelu"],
  43: ["shepherd", "ఆమోసు", "కాపరి", "గొర్రెల కాపరి", "gorrela kapari"],
  44: ["ఓబద్యా", "obadya"],
  45: ["హగ్గయి", "haggayi"],
  46: ["మలాకీ", "malaki", "malaaki"],
  47: ["iniquity", "దోషములు", "పాపములు", "doshamulu"],
  48: ["vegetables", "pulse and water", "శాకాహారము మరియు నీళ్లు", "కూరగాయలు నీళ్లు", "kuragayalu neellu"],
  49: ["హబక్కూకు", "habakkuku"],
  50: ["on a donkey", "donkey", "గాడిద", "గాడిద పిల్ల", "gadida", "gaadida"],
  51: ["matthew mark luke john", "మత్తయి మార్కు లూకా యోహాను", "mathayi marku luka yohanu"],
  52: ["గబ్రియేలు", "gabriyelu", "gabriyel"],
  53: ["బెత్లెహేము", "bethlehemu"],
  54: ["gold frankincense myrrh", "బంగారము సాంబ్రాణి బోళము", "bangaramu sambrani bolamu"],
  55: ["john", "బాప్తిస్మమిచ్చు యోహాను", "యోహాను", "baptismamichu yohanu", "yohanu"],
  56: ["forty", "40 days", "నలభై", "nalabhai"],
  57: ["water into wine", "turning water into wine", "నీళ్లను ద్రాక్షారసముగా మార్చుట", "neellanu draksharasamuga marchuta"],
  58: ["fisherman", "fishing", "జాలరులు", "చేపలు పట్టువారు", "jalarulu", "chepalu pattuvaru"],
  59: ["జక్కయ్య", "jakkayya", "zakkayya"],
  60: ["5 loaves and 2 fish", "five loaves two fish", "ఐదు రొట్టెలు రెండు చేపలు", "aidu rottelu rendu chepalu"],
  61: ["simon peter", "పేతురు", " సీమోను పేతురు", "peturu", "pethuru"],
  62: ["లాజరు", "lazaru", "laajaru"],
  63: ["మోషే మరియు ఏలీయా", "మోషే ఏలీయా", "moshe eliya"],
  64: ["jesus wept", "యేసు కన్నీళ్లు విడిచెను", "yesu kanneellu vidichenu"],
  65: ["salt of the earth and light of the world", "salt and light", "లోకమునకు ఉప్పు మరియు వెలుగు", "uppu velugu"],
  66: ["priest and levite", "యాజకుడు మరియు లేవీయుడు", "yajakudu leviyudu"],
  67: ["best robe ring and sandals", "robe ring and sandals", "ప్రశస్తమైన వస్త్రము ఉంగరము చెప్పులు", "vasthramu ungaramu cheppulu"],
  68: ["make disciples of all nations", "సర్వలోకమునకు వెళ్లి శిష్యులను చేయుడి", "shishyulanu cheyudi"],
  69: ["judas", "ఇస్కరియోతు యూదా", "యూదా", "iskariyothu yuda", "yuda"],
  70: ["gethsemane", "గెత్సేమనే", "గెత్సేమనే తోట", "gethsemane thota"],
  71: ["3", "three", "3 times", "మూడు సార్లు", "moodu sarlu"],
  72: ["pilate", "పొంతి పిలాతు", "పిలాతు", "ponthi pilathu", "pilathu"],
  73: ["simon", "కురేనీయుడైన సీమోను", "సీమోను", "kureniyudaina simonu", "simonu"],
  74: ["మగ్దలేనే మరియ", "magdalene mariya", "mariya"],
  75: ["తోమా", "thoma", "toma"],
  76: ["లూకా", "luka", "looka"],
  77: ["పెంతెకొస్తు", "penthekosthu", "pentecostu"],
  78: ["మత్తయి", "మత్తియ", "matthiya", "mathiya"],
  79: ["స్తెఫను", "stephanu", "stefanu"],
  80: ["damascus road", "damascus", "దమస్కు మార్గము", "దమస్కు", "damasku margamu", "damasku"],
  81: ["కొర్నేలి", "korneli", "corneliu"],
  82: ["అంతియొకయ", "anthiyokaya", "antiokaya"],
  83: ["tentmaker", "tent making", "డేరాలు కుట్టుట", "డేరాల వృత్తి", "deralu kuttuta"],
  84: ["మెలితే", "మాల్టా", "melithe", "malta"],
  85: ["glory of god", "దేవుని మహిమ", "devuni mahima"],
  86: ["13", "thirteen", "13వ అధ్యాయము", "13 అధ్యాయం"],
  87: ["faith hope love", "విశ్వాసము నిరీక్షణ ప్రేమ", "viswasamu nireekshana prema"],
  88: ["9", "తొమ్మిది", "thommidi", "tommidi"],
  89: ["sword of the spirit", "ఆత్మ ఖడ్గము", "atma khadgamu"],
  90: ["ఫిలేమోను", "philemonu", "filemonu"],
  91: ["అదృశ్యమైనవి", "కానరాని కార్యములు", "kanarani karyamulu"],
  92: ["యాకోబు", "yakobu"],
  93: ["ప్రేమ", "prema"],
  94: ["యోహాను", "yohanu"],
  95: ["7", "ఏడు", "edu", "yedu"],
  96: ["white red black pale", "తెలుపు ఎరుపు నలుపు పాండుర వర్ణము", "telupu erupu nalupu"],
  97: ["six hundred sixty six", "666"],
  98: ["అల్ఫా మరియు ఒమేగా", "అల్ఫా ఒమేగా", "alpha omega"],
  99: ["river of water of life", "water of life", "జీవజలముల నది", "jeevajalamula nadi"],
  100: ["ఆమేన్", "aamen", "amen"]
};

// Assign deterministic difficulty metadata based on answer/question complexity
function inferDifficulty(id, ans) {
  if (ans.length <= 7 || [1, 3, 4, 5, 13, 18, 24, 53, 56, 61, 93, 97, 100].includes(id)) return "Easy";
  if (ans.length >= 22 || [2, 25, 29, 36, 37, 38, 43, 65, 67, 89, 96, 99].includes(id)) return "Hard";
  return "Medium";
}

// Parse all 100 questions into structured objects
export function getBuiltInQuestionBank() {
  const indexMap = { A: 0, B: 1, C: 2, D: 3 };
  return RAW_BIBLE_QUESTIONS.map(line => {
    const [idStr, testament, categoryId, keywords, questionText, optA, optB, optC, optD, correctLetter, correctAnswer] = line.split("|");
    const numId = Number(idStr);
    const questionId = `q_${String(numId).padStart(3, "0")}`;
    const mcqOptions = [optA.trim(), optB.trim(), optC.trim(), optD.trim()];
    const correctOptionIndex = indexMap[correctLetter.trim()];
    const cleanCanonical = correctAnswer.replace(/^"+|"+$/g, "").trim();
    const extraVariants = TRILINGUAL_VARIANTS[numId] || [];
    const acceptedAnswers = Array.from(new Set([cleanCanonical, ...extraVariants]));

    return {
      questionId,
      numericId: numId,
      testament: testament.trim(),
      categoryId: categoryId.trim(),
      keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
      difficulty: inferDifficulty(numId, cleanCanonical),
      questionText: questionText.trim(),
      mcqOptions,
      correctOptionIndex,
      correctAnswer: cleanCanonical,
      acceptedAnswers,
      language: "bilingual",
      active: true
    };
  });
}

// Schema Validation Tooling (Section 5.1 & Section 12 of Spec)
export function validateQuestionBank(questions) {
  const errors = [];
  const seenIds = new Set();
  const seenTexts = new Set();

  questions.forEach((q, idx) => {
    const label = q.questionId || `Row ${idx + 1}`;
    if (!q.questionId) errors.push(`${label}: Missing questionId`);
    if (seenIds.has(q.questionId)) errors.push(`${label}: Duplicate questionId`);
    seenIds.add(q.questionId);

    const normQ = (q.questionText || "").trim().toLowerCase();
    if (!normQ) errors.push(`${label}: Empty questionText`);
    if (seenTexts.has(normQ)) errors.push(`${label}: Duplicate questionText`);
    seenTexts.add(normQ);

    if (!q.categoryId) errors.push(`${label}: Missing categoryId`);
    if (!Array.isArray(q.mcqOptions) || q.mcqOptions.length !== 4) {
      errors.push(`${label}: Must have exactly 4 mcqOptions`);
    } else if (new Set(q.mcqOptions.map(o => o.trim().toLowerCase())).size !== 4) {
      errors.push(`${label}: mcqOptions must be 4 distinct strings`);
    }

    if (typeof q.correctOptionIndex !== "number" || q.correctOptionIndex < 0 || q.correctOptionIndex > 3) {
      errors.push(`${label}: Invalid correctOptionIndex`);
    }
    if (!q.correctAnswer) errors.push(`${label}: Missing correctAnswer`);
    if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
      errors.push(`${label}: Missing acceptedAnswers array`);
    }
  });

  return { valid: errors.length === 0, count: questions.length, errors };
}

// Normalize English, Telugu script, and Telugu transliteration strings (Section 5.3)
export function normalizeAnswer(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return "";
  let str = rawInput
    .normalize("NFC")
    .toLowerCase()
    .trim();

  // Remove harmless surrounding quotes and punctuation while preserving Telugu diacritics/conjuncts
  str = str.replace(/["'“”‘’.,!?;:()[\]\-]/g, " ");
  // Collapse repeated spaces
  str = str.replace(/\s+/g, " ").trim();
  // Strip leading English articles for fair comparison (e.g., "A rainbow" === "rainbow")
  str = str.replace(/^(the|a|an)\s+/i, "").trim();
  return str;
}

// Conservative Levenshtein Edit Distance for long multi-word answers only
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Evaluate Typed Answer against canonical & curated trilingual variants (Section 5.3)
export function evaluateTypedAnswer(userTyped, questionKeyRecord, allowConservativeFuzzy = true) {
  const normUser = normalizeAnswer(userTyped);
  if (!normUser) return { isCorrect: false, matchedVariant: null };

  const candidates = [
    questionKeyRecord.correctAnswer,
    ...(questionKeyRecord.acceptedAnswers || [])
  ];

  for (const candidate of candidates) {
    const normCand = normalizeAnswer(candidate);
    if (!normCand) continue;

    // 1. Exact normalized match (handles English, Telugu script, and transliteration)
    if (normUser === normCand) {
      return { isCorrect: true, matchedVariant: candidate };
    }

    // 2. Conservative fuzzy match ONLY for long answers (12+ chars) and pure Latin text
    const isLatin = /^[a-z0-9\s]+$/.test(normUser) && /^[a-z0-9\s]+$/.test(normCand);
    if (allowConservativeFuzzy && isLatin && normCand.length >= 12 && normUser.length >= 10) {
      const dist = levenshteinDistance(normUser, normCand);
      const maxAllowed = normCand.length >= 22 ? 2 : 1;
      if (dist <= maxAllowed) {
        return { isCorrect: true, matchedVariant: candidate };
      }
    }
  }

  return { isCorrect: false, matchedVariant: null };
}

// Seed or sync the 100-question bank into split Firebase paths (/questionsPublic & /questionKeys)
export async function ensureQuestionBankSeeded(forceReseed = false) {
  const pubSnap = await get(ref(db, "questionsPublic"));
  if (pubSnap.exists() && !forceReseed) {
    return Object.values(pubSnap.val());
  }

  const questions = getBuiltInQuestionBank();
  const validation = validateQuestionBank(questions);
  if (!validation.valid) {
    throw new Error(`Question bank validation failed: ${validation.errors.join("; ")}`);
  }

  const updates = {};
  const publicList = [];

  for (const q of questions) {
    const publicRecord = {
      questionId: q.questionId,
      numericId: q.numericId,
      testament: q.testament,
      categoryId: q.categoryId,
      keywords: q.keywords,
      difficulty: q.difficulty,
      questionText: q.questionText,
      mcqOptions: q.mcqOptions,
      language: q.language,
      active: q.active,
      updatedAt: serverTimestamp()
    };

    const keyRecord = {
      questionId: q.questionId,
      correctOptionIndex: q.correctOptionIndex,
      correctAnswer: q.correctAnswer,
      acceptedAnswers: q.acceptedAnswers,
      updatedAt: serverTimestamp()
    };

    updates[`questionsPublic/${q.questionId}`] = publicRecord;
    updates[`questionKeys/${q.questionId}`] = keyRecord;
    publicList.push(publicRecord);
  }

  await update(ref(db), updates);
  return publicList;
}
