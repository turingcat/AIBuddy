package io.github.aaif_heybuddy.providers.openai

public fun provider(apiKey: String): io.github.aaif_heybuddy.Provider = io.github.aaif_heybuddy.openaiProvider(apiKey)

public fun defaultModel(): String = io.github.aaif_heybuddy.openaiDefaultModel()
