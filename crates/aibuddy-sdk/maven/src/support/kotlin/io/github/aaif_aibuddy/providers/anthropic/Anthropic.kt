package io.github.aaif_aibuddy.providers.anthropic

public fun provider(
    apiKey: String,
    baseUrl: String? = null,
    betaHeaders: List<String> = emptyList(),
): io.github.aaif_aibuddy.Provider = io.github.aaif_aibuddy.anthropicProvider(apiKey, baseUrl, betaHeaders)

public fun defaultModel(): String = io.github.aaif_aibuddy.anthropicDefaultModel()
