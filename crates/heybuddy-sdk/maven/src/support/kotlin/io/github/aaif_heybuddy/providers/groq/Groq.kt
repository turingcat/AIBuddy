package io.github.aaif_heybuddy.providers.groq

public fun provider(apiKey: String): io.github.aaif_heybuddy.Provider = io.github.aaif_heybuddy.groqProvider(apiKey)

public fun defaultModel(): String = io.github.aaif_heybuddy.groqDefaultModel()
