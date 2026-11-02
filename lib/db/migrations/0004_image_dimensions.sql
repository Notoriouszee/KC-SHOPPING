-- Image dimensions for social previews.
--
-- og:image:width / og:image:height tell platforms how to lay out a link preview.
-- Storing the real size at upload time is cheaper and more reliable than
-- re-reading the file on every metadata request.

ALTER TABLE product_images ADD COLUMN width INTEGER;
ALTER TABLE product_images ADD COLUMN height INTEGER;
