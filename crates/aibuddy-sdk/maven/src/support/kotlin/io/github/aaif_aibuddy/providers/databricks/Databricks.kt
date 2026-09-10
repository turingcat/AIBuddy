package io.github.aaif_aibuddy.providers.databricks

public fun provider(host: String, token: String): io.github.aaif_aibuddy.Provider =
    io.github.aaif_aibuddy.databricksProvider(host, token)

public fun defaultModel(): String = io.github.aaif_aibuddy.databricksDefaultModel()
