-- Optional customer of a project (UI04). Projects stored before keep NULL,
-- which the API reports as an absent field.
ALTER TABLE projects
ADD COLUMN customer_name TEXT CHECK (
  customer_name IS NULL
  OR length(trim(customer_name)) BETWEEN 1 AND 120
);
