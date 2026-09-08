package io.github.aaif_aibuddy.providers.openai

public fun provider(apiKey: String): io.github.aaif_aibuddy.Provider = io.github.aaif_aibuddy.openaiProvider(apiKey)

public fun defaultModel(): String = io.github.aaif_aibuddy.openaiDefaultModel()
