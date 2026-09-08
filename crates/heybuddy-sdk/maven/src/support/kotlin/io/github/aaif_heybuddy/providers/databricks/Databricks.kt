package io.github.aaif_heybuddy.providers.databricks

public fun provider(host: String, token: String): io.github.aaif_heybuddy.Provider =
    io.github.aaif_heybuddy.databricksProvider(host, token)

public fun defaultModel(): String = io.github.aaif_heybuddy.databricksDefaultModel()
