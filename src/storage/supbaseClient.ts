import { createClient } from "@supabase/supabase-js";

let url = process.env.SUPABASE_URL!
let serviceKey = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(url, serviceKey, {
    auth: {
        persistSession: false
    }
})