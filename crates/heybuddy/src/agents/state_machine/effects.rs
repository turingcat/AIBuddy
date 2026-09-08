use crate::conversation::message::Message;
use crate::conversation::Conversation;
use crate::providers::base::ProviderUsage;
use crate::recipe::Recipe;
use crate::session::ExtensionData;
use heybuddy_agent::operation::{ConversationEffect, MachineEffect};

pub enum HeyBuddyEffect {
    Conversation(ConversationEffect),
    ReplaceConversation {
        conversation: Conversation,
        usage: Option<ProviderUsage>,
    },
    SetRecipe(Box<Option<Recipe>>),
    SetExtensionData(ExtensionData),
    RecordUsage(ProviderUsage),
}

impl MachineEffect for HeyBuddyEffect {
    fn ensure_message_ids(&mut self) {
        match self {
            HeyBuddyEffect::Conversation(effect) => effect.ensure_message_ids(),
            HeyBuddyEffect::ReplaceConversation { conversation, .. } => {
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

impl From<ConversationEffect> for HeyBuddyEffect {
    fn from(effect: ConversationEffect) -> Self {
        HeyBuddyEffect::Conversation(effect)
    }
}

impl From<Message> for HeyBuddyEffect {
    fn from(message: Message) -> Self {
        ConversationEffect::from(message).into()
    }
}

impl From<Conversation> for HeyBuddyEffect {
    fn from(conversation: Conversation) -> Self {
        ConversationEffect::from(conversation).into()
    }
}
