-- Pilot tenant: Excellence Services, Dubai, 2 branches.
-- Branch names, addresses and the TRN are placeholders until the pilot confirms them.
INSERT OR IGNORE INTO tenants (id, name_en, name_ar, trn)
VALUES ('tnt_excellence', 'Excellence Services', 'إكسلنس للخدمات', '100000000000003');

INSERT OR IGNORE INTO branches (id, tenant_id, name_en, name_ar, address_line, city, emirate, phone, invoice_prefix)
VALUES
  ('br_exs_1', 'tnt_excellence', 'Branch 1', 'الفرع 1', 'Al Quoz Industrial Area', 'Dubai', 'DXB', '+97140000001', 'EXS1'),
  ('br_exs_2', 'tnt_excellence', 'Branch 2', 'الفرع 2', 'Ras Al Khor Industrial Area', 'Dubai', 'DXB', '+97140000002', 'EXS2');
