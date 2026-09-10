use crate::conversation::message::Message;
use crate::conversation::Conversation;
use crate::providers::base::ProviderUsage;
use crate::recipe::Recipe;
use crate::session::ExtensionData;
use aibuddy_agent::operation::{ConversationEffect, MachineEffect};

pub enum AIBuddyEffect {
    Conversation(ConversationEffect),
    ReplaceConversation {
        conversation: Conversation,
        usage: Option<ProviderUsage>,
    },
    SetRecipe(Box<Option<Recipe>>),
    SetExtensionData(ExtensionData),
    RecordUsage(ProviderUsage),
}

impl MachineEffect for AIBuddyEffect {
    fn ensure_message_ids(&mut self) {
        match self {
            AIBuddyEffect::Conversation(effect) => effect.ensure_message_ids(),
            AIBuddyEffect::ReplaceConversation { conversation, .. } => {
                for message in conversation.messages_mut() {
                    if message.id.is_none() {
                        message.id = Some(format!("msg_{}", uuid::Uuid::new_v4()));
                    }
                }
            }
            _ => {}
        }
    }
}

impl From<ConversationEffect> for AIBuddyEffect {
    fn from(effect: ConversationEffect) -> Self {
        AIBuddyEffect::Conversation(effect)
    }
}

impl From<Message> for AIBuddyEffect {
    fn from(message: Message) -> Self {
        ConversationEffect::from(message).into()
    }
}

impl From<Conversation> for AIBuddyEffect {
    fn from(conversation: Conversation) -> Self {
        ConversationEffect::from(conversation).into()
    }
}
