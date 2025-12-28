// Stripe Webhook Handler for DeployTemplate
// Vercel Serverless Function

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Disable body parsing, we need raw body for signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

async function recordPurchase(templateIds, userId, email, amount, currency, stripeId, paymentIntent) {
    for (const templateId of templateIds) {
        // Check if purchase already exists
        const { data: existingPurchase } = await supabase
            .from('purchases')
            .select('id')
            .eq('stripe_session_id', stripeId)
            .eq('template_id', templateId)
            .single();
        
        if (!existingPurchase) {
            // Insert new purchase record
            const { error: insertError } = await supabase
                .from('purchases')
                .insert({
                    user_id: userId || null,
                    template_id: templateId,
                    email: email,
                    amount: amount,
                    currency: currency || 'usd',
                    stripe_session_id: stripeId,
                    stripe_payment_intent: paymentIntent,
                    status: 'completed',
                    created_at: new Date().toISOString()
                });
            
            if (insertError) {
                console.error('Error inserting purchase:', insertError);
            } else {
                console.log(`Purchase recorded for template ${templateId}`);
            }
        }
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('Received event:', event.type);

    try {
        // Handle checkout.session.completed (Stripe Checkout)
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            
            console.log('Checkout session completed:', session.id);
            
            const customerEmail = session.customer_details?.email || session.customer_email;
            const metadata = session.metadata || {};
            const templateIds = metadata.template_ids ? JSON.parse(metadata.template_ids) : [];
            const userId = metadata.user_id || null;
            const amount = session.amount_total / 100;
            
            await recordPurchase(
                templateIds, 
                userId, 
                customerEmail, 
                amount, 
                session.currency, 
                session.id, 
                session.payment_intent
            );
            
            return res.status(200).json({ received: true, processed: true });
        }
        
        // Handle payment_intent.succeeded (Stripe Elements / Custom Checkout)
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            
            console.log('Payment intent succeeded:', paymentIntent.id);
            
            const metadata = paymentIntent.metadata || {};
            const templateIds = metadata.template_ids ? JSON.parse(metadata.template_ids) : [];
            const userId = metadata.user_id || null;
            const email = paymentIntent.receipt_email || metadata.email || '';
            const amount = paymentIntent.amount / 100;
            
            await recordPurchase(
                templateIds, 
                userId, 
                email, 
                amount, 
                paymentIntent.currency, 
                paymentIntent.id, 
                paymentIntent.id
            );
            
            return res.status(200).json({ received: true, processed: true });
        }

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Error processing webhook' });
    }

    // Return 200 for other event types
    return res.status(200).json({ received: true });
}
