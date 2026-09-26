// =====================================================
// CHESS TOURNAMENT MANAGER
// SUPABASE CONFIGURATION
// =====================================================

(function () {

    const SUPABASE_URL =
        "https://vtkhezcjnjyhwqyawawv.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_4qodOAWloELBwk1CK7MzlQ_tpv4zfCo";

    if (
        typeof window.supabase === "undefined" ||
        !window.supabase.createClient
    ) {
        console.error(
            "Supabase library was not loaded."
        );
        return;
    }

    try {

        window.supabaseClient =
            window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_PUBLISHABLE_KEY
            );

        console.log(
            "Supabase client created successfully."
        );

    } catch (error) {

        console.error(
            "Supabase client creation failed:",
            error
        );

    }

})();