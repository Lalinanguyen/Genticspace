from dataclasses import dataclass

from app.config import settings


@dataclass(frozen=True)
class EvmSource:
    name: str                 # matches agents.source / index_state.source
    alchemy_subdomain: str    # e.g. "eth-mainnet", "base-mainnet", "arb-mainnet"
    contract_address: str
    start_block: int


def list_evm_sources() -> list[EvmSource]:
    """Configured (opt-in) EVM sources, computed live from current settings.

    A chain only shows up here once its *_CONTRACT_ADDRESS env var is set —
    this keeps base/arbitrum fully opt-in without touching erc8004's defaults.
    """
    sources = []
    if settings.CONTRACT_ADDRESS:
        sources.append(EvmSource(
            "erc8004", "eth-mainnet", settings.CONTRACT_ADDRESS, settings.CONTRACT_START_BLOCK,
        ))
    if settings.BASE_CONTRACT_ADDRESS:
        sources.append(EvmSource(
            "base", "base-mainnet", settings.BASE_CONTRACT_ADDRESS, settings.BASE_START_BLOCK,
        ))
    if settings.ARBITRUM_CONTRACT_ADDRESS:
        sources.append(EvmSource(
            "arbitrum", "arb-mainnet", settings.ARBITRUM_CONTRACT_ADDRESS, settings.ARBITRUM_START_BLOCK,
        ))
    return sources


def get_evm_source(name: str) -> EvmSource | None:
    return next((s for s in list_evm_sources() if s.name == name), None)


# Non-EVM sources with no live ingestion path yet — pure metadata for admin
# discovery and clean 501s. Not a code path.
PLANNED_SOURCES: dict[str, str] = {
    "langchain": "Framework/marketplace ecosystem — no stable public discovery API yet.",
    "crewai": "Framework/marketplace ecosystem — no stable public discovery API yet.",
}
