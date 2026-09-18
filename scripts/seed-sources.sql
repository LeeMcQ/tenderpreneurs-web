-- Seed the 25-ish upstream public tender sources.
-- Run: wrangler d1 execute tenderpreneurs --file=scripts/seed-sources.sql
--
-- National Treasury eTenders has three official surfaces. We ingest one source_id
-- (`etenders`) from the live OCDS API. The human portal and transparency site
-- are the same dataset — do not add extra source rows or you will double-count.
--   portal:        https://www.etenders.gov.za
--   transparency:  https://data.etenders.gov.za
--   OCDS API:      https://ocds-api.etenders.gov.za

INSERT OR REPLACE INTO sources (id, name, type, url, province, poll_freq_mins) VALUES
  -- National
  ('etenders',           'eTenders Publication Portal (OCDS API)', 'national',   'https://ocds-api.etenders.gov.za/api/OCDSReleases',            NULL,           360),
  ('treasury-bulletin',  'National Treasury Tender Bulletin',   'bulletin',   'https://www.gov.za/documents/tender-bulletin',                NULL,          1440),

  -- Provincial treasuries
  ('gp-treasury',        'Gauteng Provincial Treasury',         'provincial', 'https://www.gauteng.gov.za',                                  'gauteng',      720),
  ('wc-treasury',        'Western Cape Provincial Treasury',    'provincial', 'https://www.westerncape.gov.za',                              'western-cape', 720),
  ('kzn-treasury',       'KwaZulu-Natal Provincial Treasury',   'provincial', 'https://www.kzntreasury.gov.za',                              'kwazulu-natal',720),
  ('ec-treasury',        'Eastern Cape Provincial Treasury',    'provincial', 'https://www.ectreasury.gov.za',                               'eastern-cape', 720),
  ('fs-treasury',        'Free State Provincial Treasury',      'provincial', 'https://www.treasury.fs.gov.za',                              'free-state',   720),
  ('lp-treasury',        'Limpopo Provincial Treasury',         'provincial', 'https://www.treasury.limpopo.gov.za',                         'limpopo',      720),
  ('mp-treasury',        'Mpumalanga Provincial Treasury',      'provincial', 'https://finance.mpg.gov.za',                                  'mpumalanga',   720),
  ('nc-treasury',        'Northern Cape Provincial Treasury',   'provincial', 'https://www.northern-cape.gov.za',                            'northern-cape',720),
  ('nw-treasury',        'North West Provincial Treasury',      'provincial', 'https://www.nwpg.gov.za',                                     'north-west',   720),

  -- Metros
  ('coj',                'City of Johannesburg',                'metro',      'https://www.joburg.org.za',                                   'gauteng',      720),
  ('tshwane',            'City of Tshwane',                     'metro',      'https://www.tshwane.gov.za',                                  'gauteng',      720),
  ('ekurhuleni',         'Ekurhuleni Metro',                    'metro',      'https://www.ekurhuleni.gov.za',                               'gauteng',      720),
  ('cct',                'City of Cape Town',                   'metro',      'https://web1.capetown.gov.za/web1/tenderportal/Tender',       'western-cape', 720),
  ('ethekwini',          'eThekwini Metro',                     'metro',      'https://www.durban.gov.za',                                   'kwazulu-natal',720),
  ('nmbm',               'Nelson Mandela Bay Metro',            'metro',      'https://www.nelsonmandelabay.gov.za',                         'eastern-cape', 720),
  ('bcm',                'Buffalo City Metro',                  'metro',      'https://www.buffalocity.gov.za',                              'eastern-cape', 720),
  ('mangaung',           'Mangaung Metro',                      'metro',      'https://www.mangaung.co.za',                                  'free-state',   720),

  -- Major SOEs
  ('sanral',             'SANRAL',                              'soe',        'https://www.nra.co.za/sanral-tenders/list/open-tenders',      NULL,           720),
  ('eskom',              'Eskom Tender Bulletin',               'soe',        'https://tenderbulletin.eskom.co.za/webapi/api/Lookup/GetTender?TENDER_ID=', NULL, 360),
  ('transnet',           'Transnet',                            'soe',        'https://transnetetenders.azurewebsites.net/Home/GetAdvertisedTenders', NULL, 360),
  ('prasa',              'Prasa',                               'soe',        'https://www.prasa.com',                                       NULL,           720),
  ('acsa',               'ACSA',                                'soe',        'https://www.airports.co.za',                                  NULL,           720),
  ('sita',               'SITA',                                'soe',        'https://www.sita.co.za',                                      NULL,           720),
  ('cidb-itender',       'CIDB i.Tender',                       'national',   'https://itender.cidb.org.za',                                 NULL,           720);
