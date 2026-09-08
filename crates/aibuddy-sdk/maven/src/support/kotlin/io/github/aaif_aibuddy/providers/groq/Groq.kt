package io.github.aaif_aibuddy.providers.groq

public fun provider(apiKey: String): io.github.aaif_aibuddy.Provider = io.github.aaif_aibuddy.groqProvider(apiKey)

public fun defaultModel(): String = io.github.aaif_aibuddy.groqDefaultModel()
