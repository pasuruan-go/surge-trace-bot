const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase configuration env variables are missing');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    // Set header agar bisa diakses dari frontend HTML kita
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Ambil data rute kabel beserta geojson-nya
        const { data: routes, error: routeError } = await supabase
            .from('routes')
            .select('id, name, created_at, geom_geojson:geom::json')
            .order('created_at', { ascending: false });

        if (routeError) throw routeError;

        // 2. Ambil data aset (UC/DWDM) beserta geojson-nya
        const { data: assets, error: assetError } = await supabase
            .from('node_assets')
            .select('id, route_id, asset_type, distance_from_origin, geom_geojson:geom::json');

        if (assetError) throw assetError;

        // 3. Kembalikan data gabungan ke frontend
        return res.status(200).json({ routes, assets });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};
