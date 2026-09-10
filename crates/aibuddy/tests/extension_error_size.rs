use std::error::Error;
use std::mem::size_of;

use aibuddy::agents::extension::{ExtensionError, ProcessExit};
use rmcp::service::ClientInitializeError;

const MAX_ERROR_SIZE: usize = 128;

fn connection_closed_error() -> ClientInitializeError {
    ClientInitializeError::ConnectionClosed("server closed the connection".to_owned())
}

#[test]
fn extension_errors_fit_the_result_error_budget() {
    assert!(
        size_of::<ExtensionError>() <= MAX_ERROR_SIZE,
        "ExtensionError is {} bytes, expected at most {MAX_ERROR_SIZE}",
        size_of::<ExtensionError>()
    );
    assert!(
        size_of::<ProcessExit>() <= MAX_ERROR_SIZE,
        "ProcessExit is {} bytes, expected at most {MAX_ERROR_SIZE}",
        size_of::<ProcessExit>()
    );
}

#[test]
fn client_initialize_error_conversion_preserves_display_and_source() {
    let error: ExtensionError = connection_closed_error().into();

    assert_eq!(
        error.to_string(),
        "failed to initialize MCP client: connection closed: server closed the connection"
    );
    assert_eq!(
        error.source().expect("initialize error source").to_string(),
        "connection closed: server closed the connection"
    );
    assert!(error
        .source()
        .expect("initialize error source")
        .downcast_ref::<ClientInitializeError>()
        .is_some());
}

#[test]
fn boxed_client_initialize_error_conversion_preserves_display_and_source() {
    let error: ExtensionError = Box::new(connection_closed_error()).into();

    assert_eq!(
        error.to_string(),
        "failed to initialize MCP client: connection closed: server closed the connection"
    );
    assert_eq!(
        error.source().expect("initialize error source").to_string(),
        "connection closed: server closed the connection"
    );
}

#[test]
fn process_exit_conversion_preserves_display_and_source_chain() {
    let process_exit = ProcessExit::new("child stderr", connection_closed_error());
    assert!(process_exit
        .source()
        .expect("client initialization source")
        .downcast_ref::<ClientInitializeError>()
        .is_some());

    let error: ExtensionError = process_exit.into();

    assert_eq!(
        error.to_string(),
        "process quit before initialization: stderr = child stderr"
    );

    let process_exit_source = error.source().expect("process exit source");
    assert!(process_exit_source.downcast_ref::<ProcessExit>().is_some());
    assert_eq!(
        process_exit_source.to_string(),
        "process quit before initialization: stderr = child stderr"
    );
    assert!(process_exit_source
        .source()
        .expect("client initialization source")
        .downcast_ref::<ClientInitializeError>()
        .is_some());
}
