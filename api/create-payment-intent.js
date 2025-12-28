// Create Stripe Payment Intent for Custom Checkout
// Vercel Serverless Function

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const { amount, items, templateId, templateName, userId, email } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Handle both single template and items array
        let templateIds, templateNames;
        if (templateId) {
            templateIds = [templateId];
            templateNames = templateName || 'Template Purchase';
        } else if (items) {
            templateIds = items.map(item => item.id);
            templateNames = items.map(item => item.name).join(', ');
        } else {
            templateIds = [];
            templateNames = 'Template Purchase';
        }

        // Create Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                template_ids: JSON.stringify(templateIds),
                template_names: templateNames,
                user_id: userId || '',
                email: email || '',
            },
            receipt_email: email || undefined,
            description: `DeployTemplate: ${templateNames}`,
        });

        return res.status(200).json({ 
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Error creating payment intent:', error);
        return res.status(500).json({ error: error.message });
    }
}
