import type { Database } from 'sql.js'

function insert(db: Database, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const cols = Object.keys(rows[0])
  const placeholders = cols.map(() => '?').join(', ')
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
  for (const row of rows) {
    db.run(sql, cols.map((c) => row[c] as null))
  }
}

export function seedDatabase(db: Database) {
  seedRecordings(db)
  seedTranscriptSegments(db)
  seedTags(db)
  seedAnnotations(db)
  seedLinks(db)
  seedConfidenceSignals(db)
  seedWorkspaces(db)
  seedWorkspacePanels(db)
  seedWorkspaceScopes(db)
}

function seedRecordings(db: Database) {
  insert(db, 'recordings', [
    { id: 'rec-bio-1', title: 'Biology Lecture: Cell Structure', created_at: '2026-03-28T10:00:00Z', duration: 2820000, audio_url: null, status: 'ready' },
    { id: 'rec-bio-2', title: 'Biology Lecture: Cell Division', created_at: '2026-04-04T10:00:00Z', duration: 2700000, audio_url: null, status: 'ready' },
    { id: 'rec-bio-3', title: 'Biology Lecture: Mitochondria & Energy', created_at: '2026-04-11T10:00:00Z', duration: 3000000, audio_url: null, status: 'ready' },
    { id: 'rec-bio-4', title: 'Biology Lecture: Mitochondrial DNA', created_at: '2026-04-16T10:00:00Z', duration: 2832000, audio_url: null, status: 'ready' },
    { id: 'rec-chem-1', title: 'Chemistry Lecture: Organic Reactions', created_at: '2026-04-09T14:00:00Z', duration: 2520000, audio_url: null, status: 'ready' },
  ])
}

function seedTranscriptSegments(db: Database) {
  insert(db, 'transcript_segments', [
    // rec-bio-1: Cell Structure (14 segments)
    { id: 'seg-bio1-01', recording_id: 'rec-bio-1', start_ms: 0, end_ms: 180000, text: "Welcome to Biology 101. Today we're going to start with the fundamental unit of life — the cell. Everything we'll study this semester builds on cell biology.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-02', recording_id: 'rec-bio-1', start_ms: 180000, end_ms: 360000, text: "Let's begin with the cell membrane. It's a phospholipid bilayer — two layers of fat molecules with their hydrophilic heads facing outward and hydrophobic tails facing inward.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-03', recording_id: 'rec-bio-1', start_ms: 360000, end_ms: 540000, text: 'The membrane is selectively permeable. Small nonpolar molecules like oxygen and carbon dioxide pass through freely, but ions and large molecules need transport proteins.', speaker: 'Prof. Chen' },
    { id: 'seg-bio1-04', recording_id: 'rec-bio-1', start_ms: 540000, end_ms: 720000, text: "Inside the cell, we have the cytoplasm — it's not just empty space. It's a gel-like substance called cytosol, packed with organelles, each with a specific function.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-05', recording_id: 'rec-bio-1', start_ms: 720000, end_ms: 900000, text: "The nucleus is the command center. It houses DNA, organized into chromosomes. The nuclear envelope has pores that control what enters and exits.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-06', recording_id: 'rec-bio-1', start_ms: 900000, end_ms: 1080000, text: "Ribosomes are the protein factories. They can be free-floating in the cytoplasm or attached to the endoplasmic reticulum. Free ribosomes make proteins for internal use.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-07', recording_id: 'rec-bio-1', start_ms: 1080000, end_ms: 1260000, text: "The endoplasmic reticulum comes in two forms: rough ER, studded with ribosomes, processes proteins for export. Smooth ER handles lipid synthesis and detoxification.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-08', recording_id: 'rec-bio-1', start_ms: 1260000, end_ms: 1440000, text: "Mitochondria are the powerhouses. They have a double membrane — the inner membrane is folded into cristae to increase surface area for ATP production. Remember this structure.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-09', recording_id: 'rec-bio-1', start_ms: 1440000, end_ms: 1620000, text: "The Golgi apparatus is the post office. It modifies, packages, and ships proteins received from the ER. Think of it as quality control and distribution.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-10', recording_id: 'rec-bio-1', start_ms: 1620000, end_ms: 1800000, text: "Lysosomes contain digestive enzymes. They break down waste materials and cellular debris. When a cell dies, lysosomes release their enzymes — that's autolysis.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-11', recording_id: 'rec-bio-1', start_ms: 1800000, end_ms: 1980000, text: "The cytoskeleton gives the cell its shape and enables movement. It's made of microfilaments, intermediate filaments, and microtubules — each with different functions.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-12', recording_id: 'rec-bio-1', start_ms: 1980000, end_ms: 2160000, text: "Plant cells have additional structures: a rigid cell wall outside the membrane, chloroplasts for photosynthesis, and a large central vacuole for storage and turgor pressure.", speaker: 'Prof. Chen' },
    { id: 'seg-bio1-13', recording_id: 'rec-bio-1', start_ms: 2160000, end_ms: 2520000, text: "For next week, review the differences between prokaryotic and eukaryotic cells. We'll be looking at cell division — how one cell becomes two. Read chapter 3.", speaker: 'Prof. Chen' },

    // rec-bio-2: Cell Division (13 segments)
    { id: 'seg-bio2-01', recording_id: 'rec-bio-2', start_ms: 0, end_ms: 180000, text: "Today we're covering cell division. This is one of the most important processes in biology — it's how organisms grow, repair damage, and reproduce.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-02', recording_id: 'rec-bio-2', start_ms: 180000, end_ms: 360000, text: "The cell cycle has distinct phases: G1 where the cell grows, S phase where DNA replicates, G2 where the cell prepares for division, and M phase — mitosis itself.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-03', recording_id: 'rec-bio-2', start_ms: 360000, end_ms: 540000, text: "In G1, the cell is metabolically active and growing. This is where it decides whether to commit to division. Most cells in your body are in G1 or have exited into G0.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-04', recording_id: 'rec-bio-2', start_ms: 540000, end_ms: 720000, text: "S phase is when DNA replication occurs. Each chromosome is duplicated, producing sister chromatids joined at the centromere. Errors here can lead to mutations.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-05', recording_id: 'rec-bio-2', start_ms: 720000, end_ms: 900000, text: "Mitosis has four stages: prophase, metaphase, anaphase, and telophase. In prophase, chromosomes condense and become visible. The nuclear envelope breaks down.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-06', recording_id: 'rec-bio-2', start_ms: 900000, end_ms: 1080000, text: "In metaphase, chromosomes line up at the cell equator — the metaphase plate. This alignment is critical for equal distribution of genetic material.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-07', recording_id: 'rec-bio-2', start_ms: 1080000, end_ms: 1260000, text: "The cell has checkpoints at G1, G2, and during metaphase. These are like quality control gates. The cell checks for DNA damage, complete replication, and proper chromosome attachment.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-08', recording_id: 'rec-bio-2', start_ms: 1260000, end_ms: 1440000, text: "If checkpoints fail, you get uncontrolled division — cancer. Tumor suppressor genes like p53 are checkpoint enforcers. When they're mutated, cells divide without restraint.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-09', recording_id: 'rec-bio-2', start_ms: 1440000, end_ms: 1620000, text: "Meiosis is different from mitosis. It produces four haploid cells instead of two diploid cells. This is how gametes — sperm and eggs — are formed.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-10', recording_id: 'rec-bio-2', start_ms: 1620000, end_ms: 1800000, text: "Meiosis I separates homologous pairs. Meiosis II separates sister chromatids — similar to mitosis. Crossing over during meiosis I creates genetic diversity.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-11', recording_id: 'rec-bio-2', start_ms: 1800000, end_ms: 1980000, text: "Genetic diversity from meiosis is critical for evolution. Between crossing over and independent assortment, the number of possible gamete combinations is astronomical.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-12', recording_id: 'rec-bio-2', start_ms: 1980000, end_ms: 2160000, text: "Non-disjunction — when chromosomes don't separate properly — leads to aneuploidy. Down syndrome is trisomy 21, an example of non-disjunction during meiosis.", speaker: 'Prof. Chen' },
    { id: 'seg-bio2-13', recording_id: 'rec-bio-2', start_ms: 2160000, end_ms: 2400000, text: "Next week we'll start on cellular energetics — how cells harvest energy. Read chapter 5 on mitochondria and cellular respiration.", speaker: 'Prof. Chen' },

    // rec-bio-3: Mitochondria & Energy (14 segments)
    { id: 'seg-bio3-01', recording_id: 'rec-bio-3', start_ms: 0, end_ms: 180000, text: "Today is one of my favorite lectures — cellular energetics. How does a cell convert food into usable energy? The answer is cellular respiration.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-02', recording_id: 'rec-bio-3', start_ms: 180000, end_ms: 360000, text: "First, let's revisit mitochondrial structure. The outer membrane is smooth, the inner membrane is highly folded into cristae. The space between them is the intermembrane space.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-03', recording_id: 'rec-bio-3', start_ms: 360000, end_ms: 540000, text: "The matrix — the innermost compartment — contains enzymes for the citric acid cycle. The cristae house the electron transport chain. Structure determines function.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-04', recording_id: 'rec-bio-3', start_ms: 540000, end_ms: 720000, text: "Cellular respiration has three stages: glycolysis in the cytoplasm, the citric acid cycle in the matrix, and oxidative phosphorylation on the inner membrane.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-05', recording_id: 'rec-bio-3', start_ms: 720000, end_ms: 900000, text: "The net ATP yield from one glucose molecule is approximately 30 to 32 ATP. Glycolysis produces 2, the citric acid cycle produces 2, and oxidative phosphorylation produces about 26 to 28.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-06', recording_id: 'rec-bio-3', start_ms: 900000, end_ms: 1080000, text: "The electron transport chain is a series of protein complexes that pass electrons from NADH and FADH2 to oxygen. As electrons flow, protons are pumped across the membrane.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-07', recording_id: 'rec-bio-3', start_ms: 1080000, end_ms: 1260000, text: "This proton gradient — chemiosmosis — drives ATP synthase. It's like a turbine powered by the flow of protons back into the matrix. Peter Mitchell won a Nobel Prize for this.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-08', recording_id: 'rec-bio-3', start_ms: 1260000, end_ms: 1440000, text: "Without oxygen, the electron transport chain stops. Cells switch to fermentation — either lactic acid in animals or ethanol in yeast. Much less efficient: only 2 ATP per glucose.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-09', recording_id: 'rec-bio-3', start_ms: 1440000, end_ms: 1620000, text: "Mitochondria are unique because they have their own DNA and ribosomes. They replicate independently within the cell. This is strong evidence for the endosymbiotic theory.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-10', recording_id: 'rec-bio-3', start_ms: 1620000, end_ms: 1800000, text: "The endosymbiotic theory proposes that mitochondria were once free-living bacteria that were engulfed by an ancestral eukaryotic cell. A mutually beneficial relationship evolved.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-11', recording_id: 'rec-bio-3', start_ms: 1800000, end_ms: 1980000, text: "Multiple lines of evidence support this: double membrane, own circular DNA, own ribosomes similar to bacterial ribosomes, and binary fission-like replication.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-12', recording_id: 'rec-bio-3', start_ms: 1980000, end_ms: 2160000, text: "Mitochondrial dysfunction is implicated in aging and many diseases. As mitochondria accumulate damage over time, cells produce less ATP and more reactive oxygen species.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-13', recording_id: 'rec-bio-3', start_ms: 2160000, end_ms: 2400000, text: "The lab on Friday will involve cell fractionation — separating organelles by centrifugation. You'll isolate mitochondria and measure their respiration rates.", speaker: 'Prof. Chen' },
    { id: 'seg-bio3-14', recording_id: 'rec-bio-3', start_ms: 2400000, end_ms: 2700000, text: "Next week we'll dive deeper into mitochondrial genetics — specifically mitochondrial DNA and its unusual inheritance pattern. It's fascinating stuff.", speaker: 'Prof. Chen' },

    // rec-bio-4: Mitochondrial DNA (14 segments)
    { id: 'seg-bio4-01', recording_id: 'rec-bio-4', start_ms: 0, end_ms: 180000, text: "Today we're continuing our discussion of mitochondria, but with a focus on something quite unusual about their genetics.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-02', recording_id: 'rec-bio-4', start_ms: 180000, end_ms: 360000, text: "Mitochondria have their own DNA, separate from the nuclear DNA. This is one of the key pieces of evidence for the endosymbiotic theory.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-03', recording_id: 'rec-bio-4', start_ms: 360000, end_ms: 540000, text: "The mitochondrial DNA is a circular molecule, much like bacterial DNA. It's quite small — only about 16,500 base pairs in humans.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-04', recording_id: 'rec-bio-4', start_ms: 540000, end_ms: 724000, text: "Here's the critical point: mitochondrial DNA is inherited exclusively from the maternal line. The egg cell contributes all the mitochondria.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-05', recording_id: 'rec-bio-4', start_ms: 724000, end_ms: 900000, text: "The sperm cell's mitochondria are tagged for destruction after fertilization. This is called maternal inheritance.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-06', recording_id: 'rec-bio-4', start_ms: 900000, end_ms: 1080000, text: "Now, why does this matter? Maternal inheritance means we can trace lineages through mitochondrial DNA. It's used extensively in population genetics.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-07', recording_id: 'rec-bio-4', start_ms: 1080000, end_ms: 1260000, text: "Mitochondrial mutations accumulate at a different rate than nuclear mutations. This gives us a 'molecular clock' for evolutionary studies.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-08', recording_id: 'rec-bio-4', start_ms: 1260000, end_ms: 1440000, text: "Let's talk about mitochondrial diseases. Because there's no recombination, harmful mutations can't be 'diluted out' by mixing with healthy copies.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-09', recording_id: 'rec-bio-4', start_ms: 1440000, end_ms: 1620000, text: "Examples include Leber's hereditary optic neuropathy, MELAS syndrome, and some forms of deafness. All maternally inherited.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-10', recording_id: 'rec-bio-4', start_ms: 1620000, end_ms: 1800000, text: "There's been recent controversy about potential paternal mitochondrial inheritance — a few case studies suggest it may happen rarely.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-11', recording_id: 'rec-bio-4', start_ms: 1800000, end_ms: 1980000, text: "But the consensus remains that maternal inheritance is the rule. Those rare cases may involve heteroplasmy rather than true paternal contribution.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-12', recording_id: 'rec-bio-4', start_ms: 1980000, end_ms: 2160000, text: "For the exam, you should be able to explain why mitochondria have their own DNA, what maternal inheritance means, and name at least two mitochondrial diseases.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-13', recording_id: 'rec-bio-4', start_ms: 2160000, end_ms: 2400000, text: "Next week we'll look at chloroplast DNA and compare the two organellar genomes. Similar story but with some interesting differences.", speaker: 'Prof. Chen' },
    { id: 'seg-bio4-14', recording_id: 'rec-bio-4', start_ms: 2400000, end_ms: 2600000, text: "Any questions? ... Right, remember the lab report on cell fractionation is due Friday. See you Thursday.", speaker: 'Prof. Chen' },

    // rec-chem-1: Organic Reactions (13 segments)
    { id: 'seg-chem1-01', recording_id: 'rec-chem-1', start_ms: 0, end_ms: 180000, text: "Good afternoon. Today we begin organic reactions — the bread and butter of organic chemistry. If you can master reaction mechanisms, everything else falls into place.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-02', recording_id: 'rec-chem-1', start_ms: 180000, end_ms: 360000, text: "Let's start with functional groups. Alcohols, aldehydes, ketones, carboxylic acids, amines — each has characteristic reactivity patterns.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-03', recording_id: 'rec-chem-1', start_ms: 360000, end_ms: 540000, text: "The two most fundamental reaction types we'll cover today are substitution and elimination. They compete with each other and the conditions determine which wins.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-04', recording_id: 'rec-chem-1', start_ms: 540000, end_ms: 720000, text: "SN1 is a two-step mechanism. The leaving group departs first, forming a carbocation intermediate. Then the nucleophile attacks. It's unimolecular — rate depends only on substrate.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-05', recording_id: 'rec-chem-1', start_ms: 720000, end_ms: 900000, text: "SN2 is concerted — one step. The nucleophile attacks at the same time the leaving group departs. Backside attack means inversion of stereochemistry.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-06', recording_id: 'rec-chem-1', start_ms: 900000, end_ms: 1080000, text: "How do you predict which mechanism dominates? Strong nucleophile, primary substrate, polar aprotic solvent — that's SN2. Weak nucleophile, tertiary substrate, polar protic solvent — SN1.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-07', recording_id: 'rec-chem-1', start_ms: 1080000, end_ms: 1260000, text: "E1 elimination parallels SN1 — carbocation forms first, then a base removes a proton to form a double bond. E2 parallels SN2 — concerted, anti-periplanar geometry required.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-08', recording_id: 'rec-chem-1', start_ms: 1260000, end_ms: 1440000, text: "Zaitsev's rule: in elimination, the more substituted alkene is the major product. The more stable product is favored thermodynamically.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-09', recording_id: 'rec-chem-1', start_ms: 1440000, end_ms: 1620000, text: "Here's the key to solving problems: draw the mechanism step by step. Identify the nucleophile, the electrophile, and the leaving group. Then consider the conditions.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-10', recording_id: 'rec-chem-1', start_ms: 1620000, end_ms: 1800000, text: "A common exam question: given a substrate and reagents, predict whether you'll get substitution or elimination, and which mechanism. Practice these until they're automatic.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-11', recording_id: 'rec-chem-1', start_ms: 1800000, end_ms: 1980000, text: "Carbocation stability follows the same order as substitution: tertiary > secondary > primary > methyl. This drives SN1 and E1 reactions.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-12', recording_id: 'rec-chem-1', start_ms: 1980000, end_ms: 2160000, text: "Don't forget carbocation rearrangements — hydride shifts and methyl shifts. A secondary carbocation will rearrange to tertiary if possible. This can change the product.", speaker: 'Dr. Patel' },
    { id: 'seg-chem1-13', recording_id: 'rec-chem-1', start_ms: 2160000, end_ms: 2400000, text: "Problem set 4 is due next Wednesday. Focus on mechanisms for each problem. Next lecture: addition reactions to alkenes.", speaker: 'Dr. Patel' },
  ])
}

function seedTags(db: Database) {
  insert(db, 'tags', [
    // Course tags on recordings
    { id: 'tag-course-1', target_type: 'recording', target_id: 'rec-bio-1', label: 'biology', created_at: '2026-03-28T10:00:00Z' },
    { id: 'tag-course-2', target_type: 'recording', target_id: 'rec-bio-2', label: 'biology', created_at: '2026-04-04T10:00:00Z' },
    { id: 'tag-course-3', target_type: 'recording', target_id: 'rec-bio-3', label: 'biology', created_at: '2026-04-11T10:00:00Z' },
    { id: 'tag-course-4', target_type: 'recording', target_id: 'rec-bio-4', label: 'biology', created_at: '2026-04-16T10:00:00Z' },
    { id: 'tag-course-5', target_type: 'recording', target_id: 'rec-chem-1', label: 'chemistry', created_at: '2026-04-09T14:00:00Z' },
    // Student tags on segments
    { id: 'tag-1', target_type: 'transcript_segment', target_id: 'seg-bio4-04', label: 'confused', created_at: '2026-04-16T10:12:00Z' },
    { id: 'tag-2', target_type: 'transcript_segment', target_id: 'seg-bio4-08', label: 'confused', created_at: '2026-04-16T10:25:00Z' },
    { id: 'tag-3', target_type: 'transcript_segment', target_id: 'seg-bio4-10', label: 'confused', created_at: '2026-04-16T10:32:00Z' },
    { id: 'tag-4', target_type: 'transcript_segment', target_id: 'seg-bio3-05', label: 'key-point', created_at: '2026-04-11T10:18:00Z' },
    { id: 'tag-5', target_type: 'transcript_segment', target_id: 'seg-bio4-04', label: 'key-point', created_at: '2026-04-16T10:12:30Z' },
    { id: 'tag-6', target_type: 'transcript_segment', target_id: 'seg-bio4-12', label: 'key-point', created_at: '2026-04-16T10:38:00Z' },
    { id: 'tag-7', target_type: 'transcript_segment', target_id: 'seg-bio2-07', label: 'question', created_at: '2026-04-04T10:22:00Z' },
    { id: 'tag-8', target_type: 'transcript_segment', target_id: 'seg-chem1-04', label: 'confused', created_at: '2026-04-09T14:12:00Z' },
    { id: 'tag-9', target_type: 'transcript_segment', target_id: 'seg-chem1-09', label: 'key-point', created_at: '2026-04-09T14:28:00Z' },
    { id: 'tag-10', target_type: 'transcript_segment', target_id: 'seg-bio3-07', label: 'key-point', created_at: '2026-04-11T10:22:00Z' },
  ])
}

function seedAnnotations(db: Database) {
  insert(db, 'annotations', [
    { id: 'ann-1', anchor_type: 'transcript_segment', anchor_id: 'seg-bio4-04', anchor_start_ms: null, anchor_end_ms: null, body: 'Maternal inheritance — need to understand this better', created_at: '2026-04-16T10:12:00Z', author_id: 'student-1' },
    { id: 'ann-2', anchor_type: 'transcript_segment', anchor_id: 'seg-bio4-08', anchor_start_ms: null, anchor_end_ms: null, body: 'No recombination = mutations stick around?', created_at: '2026-04-16T10:25:00Z', author_id: 'student-1' },
    { id: 'ann-3', anchor_type: 'transcript_segment', anchor_id: 'seg-bio3-05', anchor_start_ms: null, anchor_end_ms: null, body: 'This is the key formula for ATP yield', created_at: '2026-04-11T10:18:00Z', author_id: 'student-1' },
    { id: 'ann-4', anchor_type: 'transcript_segment', anchor_id: 'seg-chem1-04', anchor_start_ms: null, anchor_end_ms: null, body: 'SN1 vs SN2 still confusing', created_at: '2026-04-09T14:12:00Z', author_id: 'student-1' },
    { id: 'ann-5', anchor_type: 'transcript_segment', anchor_id: 'seg-bio2-07', anchor_start_ms: null, anchor_end_ms: null, body: 'How does the checkpoint actually detect errors?', created_at: '2026-04-04T10:22:00Z', author_id: 'student-1' },
  ])
}

function seedLinks(db: Database) {
  insert(db, 'links', [
    { id: 'link-1', source_type: 'transcript_segment', source_id: 'seg-bio4-02', target_type: 'transcript_segment', target_id: 'seg-bio3-09', relationship: 'same-concept' },
    { id: 'link-2', source_type: 'transcript_segment', source_id: 'seg-bio4-04', target_type: 'transcript_segment', target_id: 'seg-bio1-08', relationship: 'builds-on' },
    { id: 'link-3', source_type: 'transcript_segment', source_id: 'seg-bio4-07', target_type: 'transcript_segment', target_id: 'seg-bio2-11', relationship: 'related' },
    { id: 'link-4', source_type: 'transcript_segment', source_id: 'seg-bio3-05', target_type: 'transcript_segment', target_id: 'seg-bio4-08', relationship: 'related' },
    { id: 'link-5', source_type: 'transcript_segment', source_id: 'seg-bio4-04', target_type: 'recording', target_id: 'rec-bio-3', relationship: 'references' },
    { id: 'link-6', source_type: 'transcript_segment', source_id: 'seg-bio4-02', target_type: 'recording', target_id: 'rec-bio-1', relationship: 'references' },
    { id: 'link-7', source_type: 'transcript_segment', source_id: 'seg-chem1-04', target_type: 'transcript_segment', target_id: 'seg-chem1-09', relationship: 'same-concept' },
    { id: 'link-8', source_type: 'transcript_segment', source_id: 'seg-bio4-08', target_type: 'transcript_segment', target_id: 'seg-bio4-09', relationship: 'example-of' },
  ])
}

function seedConfidenceSignals(db: Database) {
  insert(db, 'confidence_signals', [
    // Bio wk1 — mostly confident (reviewed)
    { id: 'cs-1', target_type: 'transcript_segment', target_id: 'seg-bio1-02', score: 85, source_lens_id: 'test-me', created_at: '2026-04-01T20:00:00Z', decay_curve: null },
    { id: 'cs-2', target_type: 'transcript_segment', target_id: 'seg-bio1-05', score: 90, source_lens_id: 'test-me', created_at: '2026-04-01T20:05:00Z', decay_curve: null },
    { id: 'cs-3', target_type: 'transcript_segment', target_id: 'seg-bio1-08', score: 75, source_lens_id: 'test-me', created_at: '2026-04-01T20:10:00Z', decay_curve: null },
    { id: 'cs-4', target_type: 'transcript_segment', target_id: 'seg-bio1-10', score: 80, source_lens_id: 'test-me', created_at: '2026-04-01T20:15:00Z', decay_curve: null },
    // Bio wk2 — mixed
    { id: 'cs-5', target_type: 'transcript_segment', target_id: 'seg-bio2-02', score: 70, source_lens_id: 'test-me', created_at: '2026-04-08T20:00:00Z', decay_curve: null },
    { id: 'cs-6', target_type: 'transcript_segment', target_id: 'seg-bio2-05', score: 65, source_lens_id: 'test-me', created_at: '2026-04-08T20:05:00Z', decay_curve: null },
    { id: 'cs-7', target_type: 'transcript_segment', target_id: 'seg-bio2-07', score: 40, source_lens_id: 'test-me', created_at: '2026-04-08T20:10:00Z', decay_curve: null },
    { id: 'cs-8', target_type: 'transcript_segment', target_id: 'seg-bio2-09', score: 55, source_lens_id: 'test-me', created_at: '2026-04-08T20:15:00Z', decay_curve: null },
    // Bio wk3 — mixed
    { id: 'cs-9', target_type: 'transcript_segment', target_id: 'seg-bio3-04', score: 60, source_lens_id: 'test-me', created_at: '2026-04-14T20:00:00Z', decay_curve: null },
    { id: 'cs-10', target_type: 'transcript_segment', target_id: 'seg-bio3-05', score: 80, source_lens_id: 'test-me', created_at: '2026-04-14T20:05:00Z', decay_curve: null },
    { id: 'cs-11', target_type: 'transcript_segment', target_id: 'seg-bio3-07', score: 45, source_lens_id: 'test-me', created_at: '2026-04-14T20:10:00Z', decay_curve: null },
    { id: 'cs-12', target_type: 'transcript_segment', target_id: 'seg-bio3-09', score: 70, source_lens_id: 'test-me', created_at: '2026-04-14T20:15:00Z', decay_curve: null },
    // Bio wk4 — low confidence (brand new)
    { id: 'cs-13', target_type: 'transcript_segment', target_id: 'seg-bio4-02', score: 50, source_lens_id: 'test-me', created_at: '2026-04-16T21:00:00Z', decay_curve: null },
    { id: 'cs-14', target_type: 'transcript_segment', target_id: 'seg-bio4-04', score: 25, source_lens_id: 'test-me', created_at: '2026-04-16T21:05:00Z', decay_curve: null },
    { id: 'cs-15', target_type: 'transcript_segment', target_id: 'seg-bio4-08', score: 20, source_lens_id: 'test-me', created_at: '2026-04-16T21:10:00Z', decay_curve: null },
    { id: 'cs-16', target_type: 'transcript_segment', target_id: 'seg-bio4-10', score: 30, source_lens_id: 'test-me', created_at: '2026-04-16T21:15:00Z', decay_curve: null },
    // Chem — mixed (one lecture only)
    { id: 'cs-17', target_type: 'transcript_segment', target_id: 'seg-chem1-02', score: 85, source_lens_id: 'test-me', created_at: '2026-04-12T20:00:00Z', decay_curve: null },
    { id: 'cs-18', target_type: 'transcript_segment', target_id: 'seg-chem1-04', score: 50, source_lens_id: 'test-me', created_at: '2026-04-12T20:05:00Z', decay_curve: null },
    { id: 'cs-19', target_type: 'transcript_segment', target_id: 'seg-chem1-06', score: 90, source_lens_id: 'test-me', created_at: '2026-04-12T20:10:00Z', decay_curve: null },
    { id: 'cs-20', target_type: 'transcript_segment', target_id: 'seg-chem1-09', score: 75, source_lens_id: 'test-me', created_at: '2026-04-12T20:15:00Z', decay_curve: null },
  ])
}

function seedWorkspaces(db: Database) {
  insert(db, 'workspaces', [
    { id: 'ws-in-lecture', name: 'In Lecture', owner_id: 'student-1', created_at: '2026-03-28T09:00:00Z' },
    { id: 'ws-evening-review', name: 'Evening Review', owner_id: 'student-1', created_at: '2026-03-28T09:00:00Z' },
    { id: 'ws-exam-prep', name: 'Exam Prep', owner_id: 'student-1', created_at: '2026-03-28T09:00:00Z' },
  ])
}

function seedWorkspacePanels(db: Database) {
  insert(db, 'workspace_panels', [
    // In Lecture — audio capture left + transcript right (full height)
    { id: 'wp-1', workspace_id: 'ws-in-lecture', lens_type: 'audio-capture', slot_name: 'sidebar', config: JSON.stringify({ recordingId: 'rec-bio-4' }), grid_x: 0, grid_y: 0, grid_w: 1, grid_h: 4, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-1b', workspace_id: 'ws-in-lecture', lens_type: 'transcript', slot_name: 'main', config: JSON.stringify({ recordingId: 'rec-bio-4', mode: 'capture' }), grid_x: 1, grid_y: 0, grid_w: 2, grid_h: 6, created_at: '2026-03-28T09:00:00Z' },
    // Evening Review — 2×2 grid
    { id: 'wp-3', workspace_id: 'ws-evening-review', lens_type: 'transcript', slot_name: 'top-left', config: JSON.stringify({ recordingId: 'rec-bio-4', mode: 'review' }), grid_x: 0, grid_y: 0, grid_w: 2, grid_h: 3, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-4', workspace_id: 'ws-evening-review', lens_type: 'test-me', slot_name: 'top-right', config: JSON.stringify({ mode: 'review' }), grid_x: 2, grid_y: 0, grid_w: 1, grid_h: 3, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-5', workspace_id: 'ws-evening-review', lens_type: 'weekly-overview', slot_name: 'bottom-left', config: '{}', grid_x: 0, grid_y: 3, grid_w: 1, grid_h: 3, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-6', workspace_id: 'ws-evening-review', lens_type: 'connections', slot_name: 'bottom-right', config: JSON.stringify({ conceptLabel: 'mitochondrial DNA' }), grid_x: 1, grid_y: 3, grid_w: 2, grid_h: 3, created_at: '2026-03-28T09:00:00Z' },
    // Exam Prep — gap analysis wide across top, content below
    { id: 'wp-7', workspace_id: 'ws-exam-prep', lens_type: 'gap-analysis', slot_name: 'top-full', config: '{}', grid_x: 0, grid_y: 0, grid_w: 3, grid_h: 2, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-8', workspace_id: 'ws-exam-prep', lens_type: 'weakest-topics', slot_name: 'bottom-left', config: '{}', grid_x: 0, grid_y: 2, grid_w: 1, grid_h: 4, created_at: '2026-03-28T09:00:00Z' },
    { id: 'wp-9', workspace_id: 'ws-exam-prep', lens_type: 'test-me', slot_name: 'bottom-right', config: JSON.stringify({ mode: 'exam', timerSeconds: 120 }), grid_x: 1, grid_y: 2, grid_w: 2, grid_h: 4, created_at: '2026-03-28T09:00:00Z' },
  ])
}

function seedWorkspaceScopes(db: Database) {
  insert(db, 'workspace_scopes', [
    { id: 'ws-scope-1', workspace_id: 'ws-in-lecture', scope_type: 'recording', scope_value: 'rec-bio-4' },
    { id: 'ws-scope-2', workspace_id: 'ws-evening-review', scope_type: 'tag', scope_value: 'biology' },
    { id: 'ws-scope-3', workspace_id: 'ws-evening-review', scope_type: 'timeframe', scope_value: 'week' },
    { id: 'ws-scope-4', workspace_id: 'ws-exam-prep', scope_type: 'timeframe', scope_value: 'all' },
  ])
}
