-- 1. Track when the referrer redeemed their Rs 150 credit
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_reward_used_at TIMESTAMPTZ;

-- 2. Track on which order ID the referrer redeemed their Rs 150 credit
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_reward_used_on_order_id UUID REFERENCES orders(id);