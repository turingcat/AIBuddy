package io.github.aaif_heybuddy.providers.anthropic

public fun provider(
    apiKey: String,
    baseUrl: String? = null,
    betaHeaders: List<String> = emptyList(),
): io.github.aaif_heybuddy.Provider = io.github.aaif_heybuddy.anthropicProvider(apiKey, baseUrl, betaHeaders)

public fun defaultModel(): String = io.github.aaif_heybuddy.anthropicDefaultModel()
