import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRODUCT_MAP = {
    'tf-test': 'saas-landing',
    'saas-landing': 'saas-landing',
    'portfolio': 'portfolio',
    'restaurant': 'restaurant',
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sale_id, product_id, product_permalink, email, price, currency } = req.body;
        
        console.log('Gumroad Ping:', { sale_id, product_permalink, email });

        const templateSlug = PRODUCT_MAP[product_permalink] || product_permalink;

        const { data: { users } } = await supabase.auth.admin.listUsers();
        const user = users?.find(u => u.email?.toLowerCase() === email?.toLowerCase());

        if (!user) {
            return res.status(200).json({ success: false, error: 'User not found' });
        }

        const { data: template } = await supabase
            .from('templates')
            .select('id')
            .eq('slug', templateSlug)
            .single();

        if (!template) {
            return res.status(200).json({ success: false, error: 'Template not found' });
        }

        await supabase.from('purchases').upsert({
            user_id: user.id,
            template_id: template.id,
            template_slug: templateSlug,
            gumroad_sale_id: sale_id,
            gumroad_product_id: product_id,
            price_paid: price ? parseFloat(price) / 100 : 0,
            currency: currency || 'usd',
            purchased_at: new Date().toISOString()
        }, { onConflict: 'user_id,template_slug' });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(200).json({ success: false, error: error.message });
    }
}
