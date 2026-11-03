-- Addendum regole v2 (3/11/2026), R6: dispatcher di DER2 aggiunti al kit
INSERT INTO "PresenzeDispatcher" ("id", "cognome", "nome", "station") VALUES
    ('kit_disp_29', 'ALES', 'SIMONE', 'DER2'),
    ('kit_disp_30', 'HRYNCHAK', 'VIKTOR', 'DER2'),
    ('kit_disp_31', 'NAVAS CASTILLO', 'FREDDY HERNAN', 'DER2'),
    ('kit_disp_32', 'RICCARDI', 'MARIO', 'DER2')
ON CONFLICT DO NOTHING;
