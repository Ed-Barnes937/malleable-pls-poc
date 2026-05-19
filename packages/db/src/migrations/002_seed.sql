-- Seed data for development
-- user_id = 'dev-user-1' for all rows

-- ---------------------------------------------------------------------------
-- Recordings
-- ---------------------------------------------------------------------------
INSERT INTO recordings (id, user_id, title, created_at, duration, audio_url, status) VALUES
  ('rec-bio-1', 'dev-user-1', 'Biology Lecture: Cell Structure', '2026-03-28T10:00:00Z', 2820000, NULL, 'ready'),
  ('rec-bio-2', 'dev-user-1', 'Biology Lecture: Cell Division', '2026-04-04T10:00:00Z', 2700000, NULL, 'ready'),
  ('rec-bio-3', 'dev-user-1', 'Biology Lecture: Mitochondria & Energy', '2026-04-11T10:00:00Z', 3000000, NULL, 'ready'),
  ('rec-bio-4', 'dev-user-1', 'Biology Lecture: Mitochondrial DNA', '2026-04-16T10:00:00Z', 2832000, NULL, 'ready'),
  ('rec-chem-1', 'dev-user-1', 'Chemistry Lecture: Organic Reactions', '2026-04-09T14:00:00Z', 2520000, NULL, 'ready');

-- ---------------------------------------------------------------------------
-- Transcript segments
-- ---------------------------------------------------------------------------
INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker) VALUES
  -- rec-bio-1: Cell Structure
  ('seg-bio1-01', 'dev-user-1', 'rec-bio-1', 0, 180000, 'Welcome to Biology 101. Today we''re going to start with the fundamental unit of life — the cell. Everything we''ll study this semester builds on cell biology.', 'Prof. Chen'),
  ('seg-bio1-02', 'dev-user-1', 'rec-bio-1', 180000, 360000, 'Let''s begin with the cell membrane. It''s a phospholipid bilayer — two layers of fat molecules with their hydrophilic heads facing outward and hydrophobic tails facing inward.', 'Prof. Chen'),
  ('seg-bio1-03', 'dev-user-1', 'rec-bio-1', 360000, 540000, 'The membrane is selectively permeable. Small nonpolar molecules like oxygen and carbon dioxide pass through freely, but ions and large molecules need transport proteins.', 'Prof. Chen'),
  ('seg-bio1-04', 'dev-user-1', 'rec-bio-1', 540000, 720000, 'Inside the cell, we have the cytoplasm — it''s not just empty space. It''s a gel-like substance called cytosol, packed with organelles, each with a specific function.', 'Prof. Chen'),
  ('seg-bio1-05', 'dev-user-1', 'rec-bio-1', 720000, 900000, 'The nucleus is the command center. It houses DNA, organized into chromosomes. The nuclear envelope has pores that control what enters and exits.', 'Prof. Chen'),
  ('seg-bio1-06', 'dev-user-1', 'rec-bio-1', 900000, 1080000, 'Ribosomes are the protein factories. They can be free-floating in the cytoplasm or attached to the endoplasmic reticulum. Free ribosomes make proteins for internal use.', 'Prof. Chen'),
  ('seg-bio1-07', 'dev-user-1', 'rec-bio-1', 1080000, 1260000, 'The endoplasmic reticulum comes in two forms: rough ER, studded with ribosomes, processes proteins for export. Smooth ER handles lipid synthesis and detoxification.', 'Prof. Chen'),
  ('seg-bio1-08', 'dev-user-1', 'rec-bio-1', 1260000, 1440000, 'Mitochondria are the powerhouses. They have a double membrane — the inner membrane is folded into cristae to increase surface area for ATP production. Remember this structure.', 'Prof. Chen'),
  ('seg-bio1-09', 'dev-user-1', 'rec-bio-1', 1440000, 1620000, 'The Golgi apparatus is the post office. It modifies, packages, and ships proteins received from the ER. Think of it as quality control and distribution.', 'Prof. Chen'),
  ('seg-bio1-10', 'dev-user-1', 'rec-bio-1', 1620000, 1800000, 'Lysosomes contain digestive enzymes. They break down waste materials and cellular debris. When a cell dies, lysosomes release their enzymes — that''s autolysis.', 'Prof. Chen'),
  ('seg-bio1-11', 'dev-user-1', 'rec-bio-1', 1800000, 1980000, 'The cytoskeleton gives the cell its shape and enables movement. It''s made of microfilaments, intermediate filaments, and microtubules — each with different functions.', 'Prof. Chen'),
  ('seg-bio1-12', 'dev-user-1', 'rec-bio-1', 1980000, 2160000, 'Plant cells have additional structures: a rigid cell wall outside the membrane, chloroplasts for photosynthesis, and a large central vacuole for storage and turgor pressure.', 'Prof. Chen'),
  ('seg-bio1-13', 'dev-user-1', 'rec-bio-1', 2160000, 2520000, 'For next week, review the differences between prokaryotic and eukaryotic cells. We''ll be looking at cell division — how one cell becomes two. Read chapter 3.', 'Prof. Chen'),

  -- rec-bio-2: Cell Division
  ('seg-bio2-01', 'dev-user-1', 'rec-bio-2', 0, 180000, 'Today we''re covering cell division. This is one of the most important processes in biology — it''s how organisms grow, repair damage, and reproduce.', 'Prof. Chen'),
  ('seg-bio2-02', 'dev-user-1', 'rec-bio-2', 180000, 360000, 'The cell cycle has distinct phases: G1 where the cell grows, S phase where DNA replicates, G2 where the cell prepares for division, and M phase — mitosis itself.', 'Prof. Chen'),
  ('seg-bio2-03', 'dev-user-1', 'rec-bio-2', 360000, 540000, 'In G1, the cell is metabolically active and growing. This is where it decides whether to commit to division. Most cells in your body are in G1 or have exited into G0.', 'Prof. Chen'),
  ('seg-bio2-04', 'dev-user-1', 'rec-bio-2', 540000, 720000, 'S phase is when DNA replication occurs. Each chromosome is duplicated, producing sister chromatids joined at the centromere. Errors here can lead to mutations.', 'Prof. Chen'),
  ('seg-bio2-05', 'dev-user-1', 'rec-bio-2', 720000, 900000, 'Mitosis has four stages: prophase, metaphase, anaphase, and telophase. In prophase, chromosomes condense and become visible. The nuclear envelope breaks down.', 'Prof. Chen'),
  ('seg-bio2-06', 'dev-user-1', 'rec-bio-2', 900000, 1080000, 'In metaphase, chromosomes line up at the cell equator — the metaphase plate. This alignment is critical for equal distribution of genetic material.', 'Prof. Chen'),
  ('seg-bio2-07', 'dev-user-1', 'rec-bio-2', 1080000, 1260000, 'The cell has checkpoints at G1, G2, and during metaphase. These are like quality control gates. The cell checks for DNA damage, complete replication, and proper chromosome attachment.', 'Prof. Chen'),
  ('seg-bio2-08', 'dev-user-1', 'rec-bio-2', 1260000, 1440000, 'If checkpoints fail, you get uncontrolled division — cancer. Tumor suppressor genes like p53 are checkpoint enforcers. When they''re mutated, cells divide without restraint.', 'Prof. Chen'),
  ('seg-bio2-09', 'dev-user-1', 'rec-bio-2', 1440000, 1620000, 'Meiosis is different from mitosis. It produces four haploid cells instead of two diploid cells. This is how gametes — sperm and eggs — are formed.', 'Prof. Chen'),
  ('seg-bio2-10', 'dev-user-1', 'rec-bio-2', 1620000, 1800000, 'Meiosis I separates homologous pairs. Meiosis II separates sister chromatids — similar to mitosis. Crossing over during meiosis I creates genetic diversity.', 'Prof. Chen'),
  ('seg-bio2-11', 'dev-user-1', 'rec-bio-2', 1800000, 1980000, 'Genetic diversity from meiosis is critical for evolution. Between crossing over and independent assortment, the number of possible gamete combinations is astronomical.', 'Prof. Chen'),
  ('seg-bio2-12', 'dev-user-1', 'rec-bio-2', 1980000, 2160000, 'Non-disjunction — when chromosomes don''t separate properly — leads to aneuploidy. Down syndrome is trisomy 21, an example of non-disjunction during meiosis.', 'Prof. Chen'),
  ('seg-bio2-13', 'dev-user-1', 'rec-bio-2', 2160000, 2400000, 'Next week we''ll start on cellular energetics — how cells harvest energy. Read chapter 5 on mitochondria and cellular respiration.', 'Prof. Chen'),

  -- rec-bio-3: Mitochondria & Energy
  ('seg-bio3-01', 'dev-user-1', 'rec-bio-3', 0, 180000, 'Today is one of my favorite lectures — cellular energetics. How does a cell convert food into usable energy? The answer is cellular respiration.', 'Prof. Chen'),
  ('seg-bio3-02', 'dev-user-1', 'rec-bio-3', 180000, 360000, 'First, let''s revisit mitochondrial structure. The outer membrane is smooth, the inner membrane is highly folded into cristae. The space between them is the intermembrane space.', 'Prof. Chen'),
  ('seg-bio3-03', 'dev-user-1', 'rec-bio-3', 360000, 540000, 'The matrix — the innermost compartment — contains enzymes for the citric acid cycle. The cristae house the electron transport chain. Structure determines function.', 'Prof. Chen'),
  ('seg-bio3-04', 'dev-user-1', 'rec-bio-3', 540000, 720000, 'Cellular respiration has three stages: glycolysis in the cytoplasm, the citric acid cycle in the matrix, and oxidative phosphorylation on the inner membrane.', 'Prof. Chen'),
  ('seg-bio3-05', 'dev-user-1', 'rec-bio-3', 720000, 900000, 'The net ATP yield from one glucose molecule is approximately 30 to 32 ATP. Glycolysis produces 2, the citric acid cycle produces 2, and oxidative phosphorylation produces about 26 to 28.', 'Prof. Chen'),
  ('seg-bio3-06', 'dev-user-1', 'rec-bio-3', 900000, 1080000, 'The electron transport chain is a series of protein complexes that pass electrons from NADH and FADH2 to oxygen. As electrons flow, protons are pumped across the membrane.', 'Prof. Chen'),
  ('seg-bio3-07', 'dev-user-1', 'rec-bio-3', 1080000, 1260000, 'This proton gradient — chemiosmosis — drives ATP synthase. It''s like a turbine powered by the flow of protons back into the matrix. Peter Mitchell won a Nobel Prize for this.', 'Prof. Chen'),
  ('seg-bio3-08', 'dev-user-1', 'rec-bio-3', 1260000, 1440000, 'Without oxygen, the electron transport chain stops. Cells switch to fermentation — either lactic acid in animals or ethanol in yeast. Much less efficient: only 2 ATP per glucose.', 'Prof. Chen'),
  ('seg-bio3-09', 'dev-user-1', 'rec-bio-3', 1440000, 1620000, 'Mitochondria are unique because they have their own DNA and ribosomes. They replicate independently within the cell. This is strong evidence for the endosymbiotic theory.', 'Prof. Chen'),
  ('seg-bio3-10', 'dev-user-1', 'rec-bio-3', 1620000, 1800000, 'The endosymbiotic theory proposes that mitochondria were once free-living bacteria that were engulfed by an ancestral eukaryotic cell. A mutually beneficial relationship evolved.', 'Prof. Chen'),
  ('seg-bio3-11', 'dev-user-1', 'rec-bio-3', 1800000, 1980000, 'Multiple lines of evidence support this: double membrane, own circular DNA, own ribosomes similar to bacterial ribosomes, and binary fission-like replication.', 'Prof. Chen'),
  ('seg-bio3-12', 'dev-user-1', 'rec-bio-3', 1980000, 2160000, 'Mitochondrial dysfunction is implicated in aging and many diseases. As mitochondria accumulate damage over time, cells produce less ATP and more reactive oxygen species.', 'Prof. Chen'),
  ('seg-bio3-13', 'dev-user-1', 'rec-bio-3', 2160000, 2400000, 'The lab on Friday will involve cell fractionation — separating organelles by centrifugation. You''ll isolate mitochondria and measure their respiration rates.', 'Prof. Chen'),
  ('seg-bio3-14', 'dev-user-1', 'rec-bio-3', 2400000, 2700000, 'Next week we''ll dive deeper into mitochondrial genetics — specifically mitochondrial DNA and its unusual inheritance pattern. It''s fascinating stuff.', 'Prof. Chen'),

  -- rec-bio-4: Mitochondrial DNA
  ('seg-bio4-01', 'dev-user-1', 'rec-bio-4', 0, 180000, 'Today we''re continuing our discussion of mitochondria, but with a focus on something quite unusual about their genetics.', 'Prof. Chen'),
  ('seg-bio4-02', 'dev-user-1', 'rec-bio-4', 180000, 360000, 'Mitochondria have their own DNA, separate from the nuclear DNA. This is one of the key pieces of evidence for the endosymbiotic theory.', 'Prof. Chen'),
  ('seg-bio4-03', 'dev-user-1', 'rec-bio-4', 360000, 540000, 'The mitochondrial DNA is a circular molecule, much like bacterial DNA. It''s quite small — only about 16,500 base pairs in humans.', 'Prof. Chen'),
  ('seg-bio4-04', 'dev-user-1', 'rec-bio-4', 540000, 724000, 'Here''s the critical point: mitochondrial DNA is inherited exclusively from the maternal line. The egg cell contributes all the mitochondria.', 'Prof. Chen'),
  ('seg-bio4-05', 'dev-user-1', 'rec-bio-4', 724000, 900000, 'The sperm cell''s mitochondria are tagged for destruction after fertilization. This is called maternal inheritance.', 'Prof. Chen'),
  ('seg-bio4-06', 'dev-user-1', 'rec-bio-4', 900000, 1080000, 'Now, why does this matter? Maternal inheritance means we can trace lineages through mitochondrial DNA. It''s used extensively in population genetics.', 'Prof. Chen'),
  ('seg-bio4-07', 'dev-user-1', 'rec-bio-4', 1080000, 1260000, 'Mitochondrial mutations accumulate at a different rate than nuclear mutations. This gives us a ''molecular clock'' for evolutionary studies.', 'Prof. Chen'),
  ('seg-bio4-08', 'dev-user-1', 'rec-bio-4', 1260000, 1440000, 'Let''s talk about mitochondrial diseases. Because there''s no recombination, harmful mutations can''t be ''diluted out'' by mixing with healthy copies.', 'Prof. Chen'),
  ('seg-bio4-09', 'dev-user-1', 'rec-bio-4', 1440000, 1620000, 'Examples include Leber''s hereditary optic neuropathy, MELAS syndrome, and some forms of deafness. All maternally inherited.', 'Prof. Chen'),
  ('seg-bio4-10', 'dev-user-1', 'rec-bio-4', 1620000, 1800000, 'There''s been recent controversy about potential paternal mitochondrial inheritance — a few case studies suggest it may happen rarely.', 'Prof. Chen'),
  ('seg-bio4-11', 'dev-user-1', 'rec-bio-4', 1800000, 1980000, 'But the consensus remains that maternal inheritance is the rule. Those rare cases may involve heteroplasmy rather than true paternal contribution.', 'Prof. Chen'),
  ('seg-bio4-12', 'dev-user-1', 'rec-bio-4', 1980000, 2160000, 'For the exam, you should be able to explain why mitochondria have their own DNA, what maternal inheritance means, and name at least two mitochondrial diseases.', 'Prof. Chen'),
  ('seg-bio4-13', 'dev-user-1', 'rec-bio-4', 2160000, 2400000, 'Next week we''ll look at chloroplast DNA and compare the two organellar genomes. Similar story but with some interesting differences.', 'Prof. Chen'),
  ('seg-bio4-14', 'dev-user-1', 'rec-bio-4', 2400000, 2600000, 'Any questions? ... Right, remember the lab report on cell fractionation is due Friday. See you Thursday.', 'Prof. Chen'),

  -- rec-chem-1: Organic Reactions
  ('seg-chem1-01', 'dev-user-1', 'rec-chem-1', 0, 180000, 'Good afternoon. Today we begin organic reactions — the bread and butter of organic chemistry. If you can master reaction mechanisms, everything else falls into place.', 'Dr. Patel'),
  ('seg-chem1-02', 'dev-user-1', 'rec-chem-1', 180000, 360000, 'Let''s start with functional groups. Alcohols, aldehydes, ketones, carboxylic acids, amines — each has characteristic reactivity patterns.', 'Dr. Patel'),
  ('seg-chem1-03', 'dev-user-1', 'rec-chem-1', 360000, 540000, 'The two most fundamental reaction types we''ll cover today are substitution and elimination. They compete with each other and the conditions determine which wins.', 'Dr. Patel'),
  ('seg-chem1-04', 'dev-user-1', 'rec-chem-1', 540000, 720000, 'SN1 is a two-step mechanism. The leaving group departs first, forming a carbocation intermediate. Then the nucleophile attacks. It''s unimolecular — rate depends only on substrate.', 'Dr. Patel'),
  ('seg-chem1-05', 'dev-user-1', 'rec-chem-1', 720000, 900000, 'SN2 is concerted — one step. The nucleophile attacks at the same time the leaving group departs. Backside attack means inversion of stereochemistry.', 'Dr. Patel'),
  ('seg-chem1-06', 'dev-user-1', 'rec-chem-1', 900000, 1080000, 'How do you predict which mechanism dominates? Strong nucleophile, primary substrate, polar aprotic solvent — that''s SN2. Weak nucleophile, tertiary substrate, polar protic solvent — SN1.', 'Dr. Patel'),
  ('seg-chem1-07', 'dev-user-1', 'rec-chem-1', 1080000, 1260000, 'E1 elimination parallels SN1 — carbocation forms first, then a base removes a proton to form a double bond. E2 parallels SN2 — concerted, anti-periplanar geometry required.', 'Dr. Patel'),
  ('seg-chem1-08', 'dev-user-1', 'rec-chem-1', 1260000, 1440000, 'Zaitsev''s rule: in elimination, the more substituted alkene is the major product. The more stable product is favored thermodynamically.', 'Dr. Patel'),
  ('seg-chem1-09', 'dev-user-1', 'rec-chem-1', 1440000, 1620000, 'Here''s the key to solving problems: draw the mechanism step by step. Identify the nucleophile, the electrophile, and the leaving group. Then consider the conditions.', 'Dr. Patel'),
  ('seg-chem1-10', 'dev-user-1', 'rec-chem-1', 1620000, 1800000, 'A common exam question: given a substrate and reagents, predict whether you''ll get substitution or elimination, and which mechanism. Practice these until they''re automatic.', 'Dr. Patel'),
  ('seg-chem1-11', 'dev-user-1', 'rec-chem-1', 1800000, 1980000, 'Carbocation stability follows the same order as substitution: tertiary > secondary > primary > methyl. This drives SN1 and E1 reactions.', 'Dr. Patel'),
  ('seg-chem1-12', 'dev-user-1', 'rec-chem-1', 1980000, 2160000, 'Don''t forget carbocation rearrangements — hydride shifts and methyl shifts. A secondary carbocation will rearrange to tertiary if possible. This can change the product.', 'Dr. Patel'),
  ('seg-chem1-13', 'dev-user-1', 'rec-chem-1', 2160000, 2400000, 'Problem set 4 is due next Wednesday. Focus on mechanisms for each problem. Next lecture: addition reactions to alkenes.', 'Dr. Patel');

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
INSERT INTO tags (id, user_id, target_type, target_id, label, created_at) VALUES
  ('tag-course-1', 'dev-user-1', 'recording', 'rec-bio-1', 'biology', '2026-03-28T10:00:00Z'),
  ('tag-course-2', 'dev-user-1', 'recording', 'rec-bio-2', 'biology', '2026-04-04T10:00:00Z'),
  ('tag-course-3', 'dev-user-1', 'recording', 'rec-bio-3', 'biology', '2026-04-11T10:00:00Z'),
  ('tag-course-4', 'dev-user-1', 'recording', 'rec-bio-4', 'biology', '2026-04-16T10:00:00Z'),
  ('tag-course-5', 'dev-user-1', 'recording', 'rec-chem-1', 'chemistry', '2026-04-09T14:00:00Z'),
  ('tag-1', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 'confused', '2026-04-16T10:12:00Z'),
  ('tag-2', 'dev-user-1', 'transcript_segment', 'seg-bio4-08', 'confused', '2026-04-16T10:25:00Z'),
  ('tag-3', 'dev-user-1', 'transcript_segment', 'seg-bio4-10', 'confused', '2026-04-16T10:32:00Z'),
  ('tag-4', 'dev-user-1', 'transcript_segment', 'seg-bio3-05', 'key-point', '2026-04-11T10:18:00Z'),
  ('tag-5', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 'key-point', '2026-04-16T10:12:30Z'),
  ('tag-6', 'dev-user-1', 'transcript_segment', 'seg-bio4-12', 'key-point', '2026-04-16T10:38:00Z'),
  ('tag-7', 'dev-user-1', 'transcript_segment', 'seg-bio2-07', 'question', '2026-04-04T10:22:00Z'),
  ('tag-8', 'dev-user-1', 'transcript_segment', 'seg-chem1-04', 'confused', '2026-04-09T14:12:00Z'),
  ('tag-9', 'dev-user-1', 'transcript_segment', 'seg-chem1-09', 'key-point', '2026-04-09T14:28:00Z'),
  ('tag-10', 'dev-user-1', 'transcript_segment', 'seg-bio3-07', 'key-point', '2026-04-11T10:22:00Z');

-- ---------------------------------------------------------------------------
-- Annotations
-- ---------------------------------------------------------------------------
INSERT INTO annotations (id, user_id, anchor_type, anchor_id, body, created_at) VALUES
  ('ann-1', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 'Maternal inheritance — need to understand this better', '2026-04-16T10:12:00Z'),
  ('ann-2', 'dev-user-1', 'transcript_segment', 'seg-bio4-08', 'No recombination = mutations stick around?', '2026-04-16T10:25:00Z'),
  ('ann-3', 'dev-user-1', 'transcript_segment', 'seg-bio3-05', 'This is the key formula for ATP yield', '2026-04-11T10:18:00Z'),
  ('ann-4', 'dev-user-1', 'transcript_segment', 'seg-chem1-04', 'SN1 vs SN2 still confusing', '2026-04-09T14:12:00Z'),
  ('ann-5', 'dev-user-1', 'transcript_segment', 'seg-bio2-07', 'How does the checkpoint actually detect errors?', '2026-04-04T10:22:00Z');

-- ---------------------------------------------------------------------------
-- Links
-- ---------------------------------------------------------------------------
INSERT INTO links (id, user_id, source_type, source_id, target_type, target_id, relationship) VALUES
  ('link-1', 'dev-user-1', 'transcript_segment', 'seg-bio4-02', 'transcript_segment', 'seg-bio3-09', 'same-concept'),
  ('link-2', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 'transcript_segment', 'seg-bio1-08', 'builds-on'),
  ('link-3', 'dev-user-1', 'transcript_segment', 'seg-bio4-07', 'transcript_segment', 'seg-bio2-11', 'related'),
  ('link-4', 'dev-user-1', 'transcript_segment', 'seg-bio3-05', 'transcript_segment', 'seg-bio4-08', 'related'),
  ('link-5', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 'recording', 'rec-bio-3', 'references'),
  ('link-6', 'dev-user-1', 'transcript_segment', 'seg-bio4-02', 'recording', 'rec-bio-1', 'references'),
  ('link-7', 'dev-user-1', 'transcript_segment', 'seg-chem1-04', 'transcript_segment', 'seg-chem1-09', 'same-concept'),
  ('link-8', 'dev-user-1', 'transcript_segment', 'seg-bio4-08', 'transcript_segment', 'seg-bio4-09', 'example-of');

-- ---------------------------------------------------------------------------
-- Confidence signals
-- ---------------------------------------------------------------------------
INSERT INTO confidence_signals (id, user_id, target_type, target_id, score, source_lens_id, created_at) VALUES
  ('cs-1', 'dev-user-1', 'transcript_segment', 'seg-bio1-02', 85, 'test-me', '2026-04-01T20:00:00Z'),
  ('cs-2', 'dev-user-1', 'transcript_segment', 'seg-bio1-05', 90, 'test-me', '2026-04-01T20:05:00Z'),
  ('cs-3', 'dev-user-1', 'transcript_segment', 'seg-bio1-08', 75, 'test-me', '2026-04-01T20:10:00Z'),
  ('cs-4', 'dev-user-1', 'transcript_segment', 'seg-bio1-10', 80, 'test-me', '2026-04-01T20:15:00Z'),
  ('cs-5', 'dev-user-1', 'transcript_segment', 'seg-bio2-02', 70, 'test-me', '2026-04-08T20:00:00Z'),
  ('cs-6', 'dev-user-1', 'transcript_segment', 'seg-bio2-05', 65, 'test-me', '2026-04-08T20:05:00Z'),
  ('cs-7', 'dev-user-1', 'transcript_segment', 'seg-bio2-07', 40, 'test-me', '2026-04-08T20:10:00Z'),
  ('cs-8', 'dev-user-1', 'transcript_segment', 'seg-bio2-09', 55, 'test-me', '2026-04-08T20:15:00Z'),
  ('cs-9', 'dev-user-1', 'transcript_segment', 'seg-bio3-04', 60, 'test-me', '2026-04-14T20:00:00Z'),
  ('cs-10', 'dev-user-1', 'transcript_segment', 'seg-bio3-05', 80, 'test-me', '2026-04-14T20:05:00Z'),
  ('cs-11', 'dev-user-1', 'transcript_segment', 'seg-bio3-07', 45, 'test-me', '2026-04-14T20:10:00Z'),
  ('cs-12', 'dev-user-1', 'transcript_segment', 'seg-bio3-09', 70, 'test-me', '2026-04-14T20:15:00Z'),
  ('cs-13', 'dev-user-1', 'transcript_segment', 'seg-bio4-02', 50, 'test-me', '2026-04-16T21:00:00Z'),
  ('cs-14', 'dev-user-1', 'transcript_segment', 'seg-bio4-04', 25, 'test-me', '2026-04-16T21:05:00Z'),
  ('cs-15', 'dev-user-1', 'transcript_segment', 'seg-bio4-08', 20, 'test-me', '2026-04-16T21:10:00Z'),
  ('cs-16', 'dev-user-1', 'transcript_segment', 'seg-bio4-10', 30, 'test-me', '2026-04-16T21:15:00Z'),
  ('cs-17', 'dev-user-1', 'transcript_segment', 'seg-chem1-02', 85, 'test-me', '2026-04-12T20:00:00Z'),
  ('cs-18', 'dev-user-1', 'transcript_segment', 'seg-chem1-04', 50, 'test-me', '2026-04-12T20:05:00Z'),
  ('cs-19', 'dev-user-1', 'transcript_segment', 'seg-chem1-06', 90, 'test-me', '2026-04-12T20:10:00Z'),
  ('cs-20', 'dev-user-1', 'transcript_segment', 'seg-chem1-09', 75, 'test-me', '2026-04-12T20:15:00Z');

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
INSERT INTO workspaces (id, user_id, name, created_at) VALUES
  ('ws-in-lecture', 'dev-user-1', 'In Lecture', '2026-03-28T09:00:00Z'),
  ('ws-evening-review', 'dev-user-1', 'Evening Review', '2026-03-28T09:00:00Z'),
  ('ws-exam-prep', 'dev-user-1', 'Exam Prep', '2026-03-28T09:00:00Z');

-- ---------------------------------------------------------------------------
-- Workspace panels
-- ---------------------------------------------------------------------------
INSERT INTO workspace_panels (id, user_id, workspace_id, lens_type, slot_name, config, grid_x, grid_y, grid_w, grid_h, created_at) VALUES
  ('wp-1',  'dev-user-1', 'ws-in-lecture',     'audio-capture',   'sidebar',      '{"recordingId":"rec-bio-4"}', 0, 0, 1, 4, '2026-03-28T09:00:00Z'),
  ('wp-1b', 'dev-user-1', 'ws-in-lecture',     'transcript',      'main',         '{"recordingId":"rec-bio-4","mode":"capture"}', 1, 0, 2, 6, '2026-03-28T09:00:00Z'),
  ('wp-3',  'dev-user-1', 'ws-evening-review', 'transcript',      'top-left',     '{"recordingId":"rec-bio-4","mode":"review"}', 0, 0, 2, 3, '2026-03-28T09:00:00Z'),
  ('wp-4',  'dev-user-1', 'ws-evening-review', 'test-me',         'top-right',    '{"mode":"review"}', 2, 0, 1, 3, '2026-03-28T09:00:00Z'),
  ('wp-5',  'dev-user-1', 'ws-evening-review', 'weekly-overview', 'bottom-left',  '{}', 0, 3, 1, 3, '2026-03-28T09:00:00Z'),
  ('wp-6',  'dev-user-1', 'ws-evening-review', 'connections',     'bottom-right', '{"conceptLabel":"mitochondrial DNA","recordingId":"rec-bio-4"}', 1, 3, 2, 3, '2026-03-28T09:00:00Z'),
  ('wp-7',  'dev-user-1', 'ws-exam-prep',      'gap-analysis',    'top-full',     '{}', 0, 0, 3, 2, '2026-03-28T09:00:00Z'),
  ('wp-8',  'dev-user-1', 'ws-exam-prep',      'weakest-topics',  'bottom-left',  '{}', 0, 2, 1, 4, '2026-03-28T09:00:00Z'),
  ('wp-9',  'dev-user-1', 'ws-exam-prep',      'test-me',         'bottom-right', '{"mode":"exam","timerSeconds":120}', 1, 2, 2, 4, '2026-03-28T09:00:00Z');

-- ---------------------------------------------------------------------------
-- Workspace scopes
-- ---------------------------------------------------------------------------
INSERT INTO workspace_scopes (id, user_id, workspace_id, scope_type, scope_value) VALUES
  ('ws-scope-1', 'dev-user-1', 'ws-in-lecture',     'recording',  'rec-bio-4'),
  ('ws-scope-2', 'dev-user-1', 'ws-evening-review', 'tag',        'biology'),
  ('ws-scope-3', 'dev-user-1', 'ws-evening-review', 'timeframe',  'week'),
  ('ws-scope-4', 'dev-user-1', 'ws-exam-prep',      'timeframe',  'all');

-- ---------------------------------------------------------------------------
-- Workflows
-- ---------------------------------------------------------------------------
INSERT INTO workflows (id, user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id, created_at) VALUES
  ('wf-audio-transcribe',     'dev-user-1', 'audio-capture', 'recording:completed',  NULL,    NULL,       true, NULL, '2026-03-28T09:00:00Z'),
  ('wf-confused-search',      'dev-user-1', 'transcript',    'tag:created',          'label', 'confused', true, NULL, '2026-03-28T09:00:00Z'),
  ('wf-keypoint-connections', 'dev-user-1', 'transcript',    'tag:created',          'label', 'key-point',true, NULL, '2026-03-28T09:00:00Z'),
  ('wf-low-confidence',       'dev-user-1', 'test-me',       'confidence:recorded',  'lowConfidence', 'true', true, NULL, '2026-03-28T09:00:00Z');

INSERT INTO workflow_jobs (id, user_id, workflow_id, job_type, params, sort_order, delay_ms) VALUES
  ('wfj-audio-transcribe',     'dev-user-1', 'wf-audio-transcribe',     'ai:transcribe',       '{}', 0, 0),
  ('wfj-confused-search',      'dev-user-1', 'wf-confused-search',      'search:related-docs',  '{}', 0, 0),
  ('wfj-confused-quiz',        'dev-user-1', 'wf-confused-search',      'schedule:quiz',        '{}', 1, 604800000),
  ('wfj-keypoint-connections', 'dev-user-1', 'wf-keypoint-connections', 'ai:find-connections',  '{}', 0, 0),
  ('wfj-low-confidence-qs',   'dev-user-1', 'wf-low-confidence',       'ai:generate-questions', '{}', 0, 0);
