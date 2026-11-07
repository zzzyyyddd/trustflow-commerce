//! Transition policy used directly by the on-chain program.
// Status discriminants must match the serialized `Status` enum.
pub fn allowed(from: u8, to: u8) -> bool {
    matches!(
        (from, to),
        (0, 1) | (1, 2) | (2, 3) | (3, 4) | (1, 5) | (2, 5) | (5, 6)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_documented_transitions_are_allowed() {
        let expected = [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (2, 5), (5, 6)];
        for from in 0..=7 {
            for to in 0..=7 {
                assert_eq!(
                    allowed(from, to),
                    expected.contains(&(from, to)),
                    "{from} -> {to}"
                );
            }
        }
    }
    #[test]
    fn settled_states_cannot_move_again() {
        for terminal in [4, 6] {
            for to in 0..=7 {
                assert!(!allowed(terminal, to));
            }
        }
    }
    #[test]
    fn refund_never_follows_elapsed_time_or_approval() {
        for from in [0, 1, 2, 3, 4, 6] {
            assert!(!allowed(from, 6));
        }
        assert!(allowed(5, 6));
    }
}
