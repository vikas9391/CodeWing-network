#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[frame_support::pallet]
pub mod pallet {
    use frame_support::{pallet_prelude::*, BoundedVec};
    use frame_system::pallet_prelude::*;
    use sp_runtime::traits::Hash;

    type BoundedString = BoundedVec<u8, ConstU32<256>>;

    #[pallet::pallet]
    pub struct Pallet<T>(_);

    #[pallet::config]
    pub trait Config: frame_system::Config + pallet_timestamp::Config {
        type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
    }

    #[derive(Encode, Decode, TypeInfo, MaxEncodedLen, Clone, PartialEq, Debug)]
    pub struct ItemData {
        pub item_id: BoundedString,
        pub description: BoundedString,
        pub created_by: BoundedString,
        pub created_at: u64,
        pub status: ItemStatus,
    }

    #[derive(Encode, Decode, TypeInfo, MaxEncodedLen, Clone, PartialEq, Debug)]
    pub enum ItemStatus {
        Active,
        Inactive,
        Recalled,
    }

    #[pallet::storage]
    #[pallet::getter(fn is_admin)]
    pub type Admins<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, (), ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn is_scanner)]
    pub type Scanners<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, (), ValueQuery>;

    #[pallet::storage]
    #[pallet::getter(fn items)]
    pub type Items<T: Config> = StorageMap<_, Blake2_128Concat, T::Hash, ItemData, OptionQuery>;

    #[pallet::storage]
    #[pallet::getter(fn admin_items)]
    pub type AdminItems<T: Config> = StorageMap<
        _,
        Blake2_128Concat,
        T::AccountId,
        BoundedVec<T::Hash, ConstU32<1000>>,
        ValueQuery
    >;

    #[pallet::storage]
    #[pallet::getter(fn item_by_id)]
    pub type ItemById<T: Config> = StorageMap<_, Blake2_128Concat, BoundedString, T::Hash, OptionQuery>;

    #[pallet::event]
    #[pallet::generate_deposit(pub(super) fn deposit_event)]
    pub enum Event<T: Config> {
        AdminAdded { account: T::AccountId },
        AdminRemoved { account: T::AccountId },
        ScannerAdded { account: T::AccountId },
        ScannerRemoved { account: T::AccountId },
        ItemRegistered { hash: T::Hash, item_id: BoundedString, by: T::AccountId },
        ItemScanned { hash: T::Hash, by: T::AccountId },
        ItemStatusUpdated { hash: T::Hash, status: ItemStatus },
    }

    #[pallet::error]
    pub enum Error<T> {
        NotAuthorized,
        NotAdmin,
        NotScanner,
        ItemNotFound,
        ItemAlreadyExists,
        TooManyItems,
        InvalidData,
        AlreadyAdmin,
        AlreadyScanner,
    }

    #[pallet::genesis_config]
    #[derive(frame_support::DefaultNoBound)]
    pub struct GenesisConfig<T: Config> {
        pub admins: Vec<T::AccountId>,
    }

    #[pallet::genesis_build]
    impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
        fn build(&self) {
            for admin in &self.admins {
                Admins::<T>::insert(admin, ());
            }
        }
    }

    #[pallet::call]
    impl<T: Config> Pallet<T> {
        #[pallet::call_index(0)]
        #[pallet::weight(10_000)]
        pub fn add_admin(origin: OriginFor<T>, account: T::AccountId) -> DispatchResult {
            ensure_root(origin)?;
            ensure!(!Admins::<T>::contains_key(&account), Error::<T>::AlreadyAdmin);
            Admins::<T>::insert(&account, ());
            Self::deposit_event(Event::AdminAdded { account });
            Ok(())
        }

        #[pallet::call_index(1)]
        #[pallet::weight(10_000)]
        pub fn remove_admin(origin: OriginFor<T>, account: T::AccountId) -> DispatchResult {
            ensure_root(origin)?;
            Admins::<T>::remove(&account);
            Self::deposit_event(Event::AdminRemoved { account });
            Ok(())
        }

        #[pallet::call_index(2)]
        #[pallet::weight(10_000)]
        pub fn add_scanner(origin: OriginFor<T>, account: T::AccountId) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(Admins::<T>::contains_key(&who), Error::<T>::NotAdmin);
            ensure!(!Scanners::<T>::contains_key(&account), Error::<T>::AlreadyScanner);
            Scanners::<T>::insert(&account, ());
            Self::deposit_event(Event::ScannerAdded { account });
            Ok(())
        }

        #[pallet::call_index(3)]
        #[pallet::weight(10_000)]
        pub fn remove_scanner(origin: OriginFor<T>, account: T::AccountId) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(Admins::<T>::contains_key(&who), Error::<T>::NotAdmin);
            Scanners::<T>::remove(&account);
            Self::deposit_event(Event::ScannerRemoved { account });
            Ok(())
        }

        #[pallet::call_index(4)]
        #[pallet::weight(50_000)]
        pub fn register_item(
            origin: OriginFor<T>,
            item_id: Vec<u8>,
            description: Vec<u8>,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(Admins::<T>::contains_key(&who), Error::<T>::NotAdmin);

            let bounded_id: BoundedString = item_id.try_into()
                .map_err(|_| Error::<T>::InvalidData)?;
            let bounded_desc: BoundedString = description.try_into()
                .map_err(|_| Error::<T>::InvalidData)?;

            ensure!(!ItemById::<T>::contains_key(&bounded_id), Error::<T>::ItemAlreadyExists);

            let timestamp = <pallet_timestamp::Pallet<T>>::get();
            let item_data = ItemData {
                item_id: bounded_id.clone(),
                description: bounded_desc,
                created_by: who.encode().try_into().unwrap_or_default(),
                created_at: timestamp.saturated_into::<u64>(),
                status: ItemStatus::Active,
            };

            let hash = T::Hashing::hash_of(&item_data);

            Items::<T>::insert(hash, item_data);
            ItemById::<T>::insert(&bounded_id, hash);
            
            AdminItems::<T>::try_mutate(&who, |list| {
                list.try_push(hash).map_err(|_| Error::<T>::TooManyItems)
            })?;

            Self::deposit_event(Event::ItemRegistered { hash, item_id: bounded_id, by: who });
            Ok(())
        }

        #[pallet::call_index(5)]
        #[pallet::weight(30_000)]
        pub fn scan_item(origin: OriginFor<T>, hash: T::Hash) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(
                Admins::<T>::contains_key(&who) || Scanners::<T>::contains_key(&who),
                Error::<T>::NotScanner
            );
            
            ensure!(Items::<T>::contains_key(hash), Error::<T>::ItemNotFound);
            Self::deposit_event(Event::ItemScanned { hash, by: who });
            Ok(())
        }

        #[pallet::call_index(6)]
        #[pallet::weight(40_000)]
        pub fn update_status(
            origin: OriginFor<T>,
            hash: T::Hash,
            new_status: ItemStatus,
        ) -> DispatchResult {
            let who = ensure_signed(origin)?;
            ensure!(Admins::<T>::contains_key(&who), Error::<T>::NotAdmin);

            Items::<T>::try_mutate(hash, |maybe_item| {
                let item = maybe_item.as_mut().ok_or(Error::<T>::ItemNotFound)?;
                item.status = new_status.clone();
                Ok::<(), Error<T>>(())
            })?;

            Self::deposit_event(Event::ItemStatusUpdated { hash, status: new_status });
            Ok(())
        }
    }
}