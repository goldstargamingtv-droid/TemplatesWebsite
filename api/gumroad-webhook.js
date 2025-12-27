const PRODUCT_MAP = {
    'tf-test': 'saas-landing',
    'saas-landing': 'saas-landing',
    'portfolio': 'portfolio',
    'restaurant': 'restaurant',
};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'Webhook endpoint active' });
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
        const { sale_id, product_id, product_permalink, email, price, currency, short_product_id } = req.body;
        
        console.log('Gumroad Ping received:', { sale_id, product_permalink, short_product_id, email, price });

        // Extract permalink slug - handle both full URL and short form
        let permalinkKey = short_product_id || product_permalink || '';
        
        // If it's a URL, extract the last part
        if (permalinkKey.includes('/')) {
            permalinkKey = permalinkKey.split('/').pop();
        }
        
        // Remove any query params
        if (permalinkKey.includes('?')) {
            permalinkKey = permalinkKey.split('?')[0];
        }
        
        console.log('Extracted permalink key:', permalinkKey);
        
        const templateSlug = PRODUCT_MAP[permalinkKey] || permalinkKey;

        // Find user by email using Supabase REST API
        const usersResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'apikey': SUPABASE_SERVICE_KEY
            }
        });
        
        const usersData = await usersResponse.json();
        const user = usersData.users?.find(u => u.email?.toLowerCase() === email?.toLowerCase());

        if (!user) {
            console.log('User not found for email:', email);
            return res.status(200).json({ success: false, error: 'User not found', email });
        }

        console.log('Found user:', user.id);

        // Find template
        const templateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/templates?slug=eq.${templateSlug}&select=id`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'apikey': SUPABASE_SERVICE_KEY
                }
            }
        );
        
        const templates = await templateResponse.json();
        const template = templates?.[0];

        // Insert purchase using upsert
        const purchaseData = {
            user_id: user.id,
            template_id: template?.id || null,
            template_slug: templateSlug,
            gumroad_sale_id: sale_id,
            gumroad_product_id: product_id,
            price_paid: price ? parseFloat(price) / 100 : 0,
            currency: currency || 'usd',
            purchased_at: new Date().toISOString()
        };

        const purchaseResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(purchaseData)
            }
        );

        if (!purchaseResponse.ok) {
            const errorText = await purchaseResponse.text();
            console.error('Purchase insert error:', errorText);
            return res.status(200).json({ success: false, error: errorText });
        }

        console.log('Purchase recorded for user:', user.id);
        return res.status(200).json({ success: true, userId: user.id, templateSlug });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(200).json({ success: false, error: error.message });
    }
};
