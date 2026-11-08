-- Give every product a distinct discovery salt.
--
-- The column was added with a default of 0 and rows created afterwards inherited
-- that default, which made the discovery ordering fall back to id order (identical
-- arrangement on every visit). Backfill anything still at zero.

UPDATE products
   SET discovery_salt = abs(random()) % 1000000
 WHERE discovery_salt = 0;
