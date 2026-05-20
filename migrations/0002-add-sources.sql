-- migrations/0002-add-sources.sql
--
-- Adds rows to the `sources` table for every new scraper.
-- Run with:
--   wrangler d1 execute tenderpreneurs --remote --file=migrations/0002-add-sources.sql
--
-- IMPORTANT: this uses INSERT OR IGNORE so it's safe to run repeatedly. If a
-- source already exists with a different `active` flag or URL, update it
-- separately with a targeted UPDATE statement.

-- ============================================================================
-- Tier 1: Metro municipalities
-- ============================================================================

INSERT OR IGNORE INTO sources (id, name, kind, base_url, province, active) VALUES
  ('city-cape-town',       'City of Cape Town',                            'metro', 'https://web1.capetown.gov.za/web1/tenderportal/Tender',                 'western-cape',  1),
  ('joburg-metro',         'City of Johannesburg',                         'metro', 'https://www.joburg.org.za/work_/Pages/Work%20in%20the%20City/Tenders.aspx', 'gauteng',       1),
  ('tshwane',              'City of Tshwane',                              'metro', 'https://www.tshwane.gov.za/?page_id=11118',                             'gauteng',       1),
  ('ethekwini',            'eThekwini Municipality',                       'metro', 'https://supplychain.durban.gov.za',                                     'kwazulu-natal', 1),
  ('ekurhuleni',           'Ekurhuleni Metropolitan Municipality',         'metro', 'https://www.ekurhuleni.gov.za/services/business/tenders',               'gauteng',       1),
  ('nelson-mandela-bay',   'Nelson Mandela Bay Metropolitan Municipality', 'metro', 'https://www.nelsonmandelabay.gov.za/Tenders',                           'eastern-cape',  1),
  ('buffalo-city',         'Buffalo City Metropolitan Municipality',       'metro', 'https://www.buffalocity.gov.za',                                        'eastern-cape',  1),
  ('mangaung',             'Mangaung Metropolitan Municipality',           'metro', 'https://www.mangaung.co.za',                                            'free-state',    1),
  ('msunduzi',             'Msunduzi Municipality',                        'metro', 'https://www.msunduzi.gov.za',                                           'kwazulu-natal', 1);

-- ============================================================================
-- Tier 2: State-owned entities
-- ============================================================================

INSERT OR IGNORE INTO sources (id, name, kind, base_url, province, active) VALUES
  ('eskom',                'Eskom',                                        'soe', 'https://tenderbulletin.eskom.co.za',                                      'national', 1),
  ('transnet',             'Transnet',                                     'soe', 'https://www.transnet.net/TenderBulletin',                                'national', 1),
  ('sanral',               'South African National Roads Agency (SANRAL)', 'soe', 'https://www.nra.co.za/business/tenders/current-tenders',                 'national', 1),
  ('prasa',                'Passenger Rail Agency of South Africa (PRASA)','soe', 'https://www.prasa.com/Tenders.html',                                     'national', 1),
  ('acsa',                 'Airports Company South Africa (ACSA)',         'soe', 'https://www.airports.co.za/business/tenders',                            'national', 1),
  ('rand-water',           'Rand Water',                                   'soe', 'https://www.randwater.co.za/Tender/Pages/default.aspx',                  'gauteng',  1),
  ('umgeni-water',         'Umgeni Water',                                 'soe', 'https://www.umgeni.co.za/tenders',                                       'kwazulu-natal', 1),
  ('telkom',               'Telkom SA',                                    'soe', 'https://group.telkom.co.za/sourcing/',                                   'national', 1);

-- ============================================================================
-- Tier 3: Catch-all bulletin
-- ============================================================================

INSERT OR IGNORE INTO sources (id, name, kind, base_url, province, active) VALUES
  ('government-tender-bulletin', 'Government Tender Bulletin (weekly)', 'bulletin', 'https://www.gpwonline.co.za/Gazettes/Pages/Tender-Bulletin.aspx', 'national', 1);
