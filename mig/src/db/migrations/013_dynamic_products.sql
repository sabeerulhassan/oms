BEGIN;

-- 1. Create Core Tables
CREATE TABLE IF NOT EXISTS products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                VARCHAR(255) UNIQUE NOT NULL,
  name                VARCHAR(255) NOT NULL,
  flavor              VARCHAR(255) NOT NULL,
  ingredients         TEXT NOT NULL,
  description         TEXT NOT NULL,
  usage               TEXT NOT NULL,
  tags                TEXT[] DEFAULT '{}',
  default_youtube_id  VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  image_url   VARCHAR(1024) NOT NULL,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  size            VARCHAR(50) NOT NULL,
  price           INTEGER NOT NULL,
  in_stock        BOOLEAN DEFAULT TRUE,
  size_youtube_id VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_product_size UNIQUE (product_id, size)
);

CREATE TABLE IF NOT EXISTS product_size_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_size_id UUID REFERENCES product_sizes(id) ON DELETE CASCADE,
  image_url       VARCHAR(1024) NOT NULL,
  position        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Populate Initial Seed Data (Matching lib/data.ts)
INSERT INTO products (id, slug, name, flavor, ingredients, description, usage, tags, default_youtube_id) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'sugar-salted-smooth', 'Sugar Salted Smooth', 'Classic Balanced Smooth', 'Peanuts, Sugar, Salt', 'Our signature classic recipe. Ground to a silky-smooth consistency with the perfect touch of sweetness and salt.', 'Drizzle over fresh bananas, spread generously on warm morning toast, or blend into thick breakfast smoothies.', ARRAY['Best Seller', 'Classic'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'sugar-salted-crunchy', 'Sugar Salted Crunchy', 'Classic Textured Crunch', 'Peanuts, Sugar, Salt', 'The traditional recipe you love with a satisfying crunch. Loaded with fresh-roasted peanut pieces throughout.', 'Perfect for classic peanut butter sandwiches, baking rustic cookies, or enjoying straight off the spoon.', ARRAY['Classic', 'Crunchy'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'salted-sugar-free-smooth', 'Salted Sugar-Free Smooth', 'Smooth Savory Blend', 'Peanuts, Salt', 'All of the rich peanut flavor, none of the sugar. Ground smooth with a light pinch of salt to highlight the roast.', 'Excellent as a savory dip for sliced apples or celery, or stirred into warm oats for a clean, sugar-free breakfast.', ARRAY['Sugar-Free', 'Smooth'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'salted-sugar-free-crunchy', 'Salted Sugar-Free Crunchy', 'Crunchy Savory Blend', 'Peanuts, Salt', 'For those who want a crunchy texture with zero sugar. Simple, savory, and packed with roasted peanut chunks.', 'Great for high-protein keto bowls, stirred into greek yogurt, or spread on low-carb crackers.', ARRAY['Sugar-Free', 'Crunchy'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'unsalted-sugar-free-smooth', 'Unsalted Sugar-Free Smooth', '100% Pure Peanut', 'Roasted Peanuts Only', 'Exactly one pure ingredient. No added sugar, no added salt, and no extra oils—just raw roasted peanut goodness.', 'Highly recommended for high-protein gym shakes, home baking where you want to control the salt, or as a clean ingredient in baby food.', ARRAY['100% Pure', 'Sugar-Free', 'Unsalted'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'nai-miris-spicy', 'Nai Miris Spicy', 'Fiery Savory Kick', 'Peanuts, Nai Miris (Cobra Chilli), Sugar, Salt', 'Infused with a touch of fiery Sri Lankan Nai Miris (Cobra Chilli). A unique savory kick that bridges rich creaminess with native heat.', 'Incredible spread directly onto beef or chicken burgers, whisked into a savory satay dipping sauce, or used as a spicy glaze for grilled local meats.', ARRAY['Nai Miris', 'Spicy', 'Savory'], NULL),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', 'chocofeda-chocolate-peanut', 'Chocofeda Chocolate Spread', 'Chocolate Peanut Blend', 'Peanuts, Cocoa Powder, Sugar, Salt', 'Our delicious chocolate peanut spread under the Chocofeda brand. Rich, creamy, chocolaty, and deeply satisfying.', 'Spread on crepes, parathas, roti, or sliced bread. Perfect as a cleaner dip for strawberries and pretzels.', ARRAY['Chocofeda', 'Chocolate', 'Kids Favorite'], NULL);

-- Seed Default Product Images (Using existing assets)
INSERT INTO product_images (product_id, image_url, position) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '/classic-smooth.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '/classic-crunchy.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', '/sugar-free-smooth.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', '/sugar-free-crunchy.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', '/unsalted-sugar-free.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', '/nai-miris-spicy.png', 1),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', '/chocofeda.png', 1);

-- Seed Sizes and Prices
INSERT INTO product_sizes (product_id, size, price, in_stock) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '450g', 1350, TRUE),

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', '450g', 1350, TRUE),

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', '450g', 1350, TRUE),

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', '450g', 1350, TRUE),

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', '450g', 1350, FALSE), -- Seed as out of stock

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', '220g', 750, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', '340g', 1050, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', '450g', 1350, TRUE),

('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', '220g', 790, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', '340g', 1100, TRUE),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', '450g', 1400, TRUE);

COMMIT;