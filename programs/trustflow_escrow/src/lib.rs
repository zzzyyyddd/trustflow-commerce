use anchor_lang::prelude::*;
mod rules;
use anchor_lang::system_program::{self, Transfer};

declare_id!("8DK8Z1Uz8Nv3KTvVE7kxrm79mijQEL2nC5CAacPHgJ4Z");

#[program]
pub mod trustflow_escrow {
    use super::*;

    pub fn create_escrow(ctx: Context<CreateEscrow>, id: u64, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let buyer = ctx.accounts.buyer.key();
        let seller = ctx.accounts.seller.key();
        let arbitrator = ctx.accounts.arbitrator.key();
        require!(
            buyer != seller && buyer != arbitrator && seller != arbitrator,
            EscrowError::InvalidParty
        );
        let escrow = &mut ctx.accounts.escrow;
        escrow.id = id;
        escrow.buyer = buyer;
        escrow.seller = seller;
        escrow.arbitrator = arbitrator;
        escrow.amount = amount;
        escrow.evidence_hash = [0; 32];
        escrow.status = Status::Created;
        escrow.bump = ctx.bumps.escrow;
        Ok(())
    }

    pub fn fund(ctx: Context<Fund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.transition(Status::Created, Status::Funded)?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: escrow.to_account_info(),
                },
            ),
            escrow.amount,
        )?;
        Ok(())
    }

    pub fn submit_evidence(ctx: Context<SubmitEvidence>, hash: [u8; 32]) -> Result<()> {
        require!(hash != [0; 32], EscrowError::InvalidEvidence);
        let escrow = &mut ctx.accounts.escrow;
        escrow.transition(Status::Funded, Status::EvidenceSubmitted)?;
        escrow.evidence_hash = hash;
        Ok(())
    }

    pub fn approve(ctx: Context<BuyerAction>) -> Result<()> {
        ctx.accounts
            .escrow
            .transition(Status::EvidenceSubmitted, Status::Approved)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.transition(Status::Approved, Status::Released)?;
        let amount = escrow.amount;
        escrow.sub_lamports(amount)?;
        ctx.accounts.seller.add_lamports(amount)?;
        Ok(())
    }

    pub fn dispute(ctx: Context<Dispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            ctx.accounts.party.key() == escrow.buyer || ctx.accounts.party.key() == escrow.seller,
            EscrowError::Unauthorized
        );
        let current = escrow.status;
        escrow.transition(current, Status::Disputed)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        escrow.transition(Status::Disputed, Status::Refunded)?;
        let amount = escrow.amount;
        escrow.sub_lamports(amount)?;
        ctx.accounts.buyer.add_lamports(amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub seller: SystemAccount<'info>,
    pub arbitrator: SystemAccount<'info>,
    #[account(init, payer = buyer, space = 8 + Escrow::INIT_SPACE, seeds = [b"escrow", buyer.key().as_ref(), &id.to_le_bytes()], bump)]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut, has_one = buyer)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    #[account(mut, has_one = seller)]
    pub escrow: Account<'info, Escrow>,
    pub seller: Signer<'info>,
}
#[derive(Accounts)]
pub struct BuyerAction<'info> {
    #[account(mut, has_one = buyer)]
    pub escrow: Account<'info, Escrow>,
    pub buyer: Signer<'info>,
}
#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut, has_one = seller)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub seller: SystemAccount<'info>,
}
#[derive(Accounts)]
pub struct Dispute<'info> {
    #[account(mut)]
    pub escrow: Account<'info, Escrow>,
    pub party: Signer<'info>,
}
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut, has_one = buyer, has_one = arbitrator)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub buyer: SystemAccount<'info>,
    pub arbitrator: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub id: u64,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    pub amount: u64,
    pub evidence_hash: [u8; 32],
    pub status: Status,
    pub bump: u8,
}
impl Escrow {
    fn transition(&mut self, expected: Status, next: Status) -> Result<()> {
        require!(
            self.status == expected && rules::allowed(self.status as u8, next as u8),
            EscrowError::InvalidState
        );
        self.status = next;
        Ok(())
    }
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Status {
    Created,
    Funded,
    EvidenceSubmitted,
    Approved,
    Released,
    Disputed,
    Refunded,
}
#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Buyer, seller and arbitrator must be distinct")]
    InvalidParty,
    #[msg("Evidence hash must not be zero")]
    InvalidEvidence,
    #[msg("Action is not permitted in this state")]
    InvalidState,
    #[msg("Signer is not an escrow party")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn escrow() -> Escrow {
        Escrow {
            id: 1,
            buyer: Pubkey::new_unique(),
            seller: Pubkey::new_unique(),
            arbitrator: Pubkey::new_unique(),
            amount: 10,
            evidence_hash: [0; 32],
            status: Status::Created,
            bump: 0,
        }
    }
    #[test]
    fn happy_path_and_double_settlement() {
        let mut e = escrow();
        assert!(e.transition(Status::Created, Status::Funded).is_ok());
        assert!(e
            .transition(Status::Funded, Status::EvidenceSubmitted)
            .is_ok());
        assert!(e
            .transition(Status::EvidenceSubmitted, Status::Approved)
            .is_ok());
        assert!(e.transition(Status::Approved, Status::Released).is_ok());
        assert!(e.transition(Status::Approved, Status::Released).is_err());
        assert!(e.transition(Status::Disputed, Status::Refunded).is_err());
    }
    #[test]
    fn refund_requires_dispute_and_is_final() {
        let mut e = escrow();
        assert!(e.transition(Status::Disputed, Status::Refunded).is_err());
        e.status = Status::Disputed;
        assert!(e.transition(Status::Disputed, Status::Refunded).is_ok());
        assert!(e.transition(Status::Disputed, Status::Refunded).is_err());
        assert!(e.transition(Status::Approved, Status::Released).is_err());
    }
    #[test]
    fn release_requires_approval() {
        let mut e = escrow();
        for state in [
            Status::Created,
            Status::Funded,
            Status::EvidenceSubmitted,
            Status::Disputed,
        ] {
            e.status = state;
            assert!(e.transition(Status::Approved, Status::Released).is_err());
            assert_eq!(e.status, state);
        }
    }
}
