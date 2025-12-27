const { createClient } = require('@supabase/supabase-js');

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

module.exports = async function handler(req, res) {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'Webhook endpoint active' });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sale_id, product_id, product_permalink, email, price, currency } = req.body;
        
        console.log('Gumroad Ping received:', { sale_id, product_permalink, email, price });

        const templateSlug = PRODUCT_MAP[product_permalink] || product_permalink;

        // Find user by email
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        
        if (usersError) {
            console.error('Error listing users:', usersError);
            return res.status(200).json({ success: false, error: 'Failed to list users' });
        }
        
        const user = users?.find(u => u.email?.toLowerCase() === email?.toLowerCase());

        if (!user) {
            console.log('User not found for email:', email);
            return res.status(200).json({ success: false, error: 'User not found' });
        }

        console.log('Found user:', user.id);

        // Find template
        const { data: template, error: templateError } = await supabase
            .from('templates')
            .select('id')
            .eq('slug', templateSlug)
            .single();

        if (templateError) {
            console.error('Template error:', templateError);
        }

        // Insert purchase
        const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .upsert({
                user_id: user.id,
                template_id: template?.id || null,
                template_slug: templateSlug,
                gumroad_sale_id: sale_id,
                gumroad_product_id: product_id,
                price_paid: price ? parseFloat(price) / 100 : 0,
                currency: currency || 'usd',
                purchased_at: new Date().toISOString()
            }, { 
                onConflict: 'user_id,template_slug' 
            })
            .select();

        if (purchaseError) {
            console.error('Purchase insert error:', purchaseError);
            return res.status(200).json({ success: false, error: purchaseError.message });
        }

        console.log('Purchase recorded:', purchase);
        return res.status(200).json({ success: true, purchase });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(200).json({ success: false, error: error.message });
    }
};
