-- Case-insensitive joins must resolve to at most one attributed model category.
CREATE UNIQUE INDEX motorcycle_model_categories_normalized ON motorcycle_model_categories(lower(brand),lower(model));
