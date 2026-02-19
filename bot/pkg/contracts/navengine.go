// Code generated - DO NOT EDIT.
// This file is a generated binding and any manual changes will be lost.

package contracts

import (
	"errors"
	"math/big"
	"strings"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
)

// Reference imports to suppress errors if they are not otherwise used.
var (
	_ = errors.New
	_ = big.NewInt
	_ = strings.NewReader
	_ = ethereum.NotFound
	_ = bind.Bind
	_ = common.Big1
	_ = types.BloomLookup
	_ = event.NewSubscription
	_ = abi.ConvertType
)

// NavEngineMetaData contains all meta data concerning the NavEngine contract.
var NavEngineMetaData = &bind.MetaData{
	ABI: "[{\"inputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"constructor\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"target\",\"type\":\"address\"}],\"name\":\"AddressEmptyCode\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"implementation\",\"type\":\"address\"}],\"name\":\"ERC1967InvalidImplementation\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"ERC1967NonPayable\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"EnforcedPause\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"ExpectedPause\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"FailedCall\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"InvalidInitialization\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"NotInitializing\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"owner\",\"type\":\"address\"}],\"name\":\"OwnableInvalidOwner\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"OwnableUnauthorizedAccount\",\"type\":\"error\"},{\"inputs\":[],\"name\":\"UUPSUnauthorizedCallContext\",\"type\":\"error\"},{\"inputs\":[{\"internalType\":\"bytes32\",\"name\":\"slot\",\"type\":\"bytes32\"}],\"name\":\"UUPSUnsupportedProxiableUUID\",\"type\":\"error\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"int192\",\"name\":\"rate\",\"type\":\"int192\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"timestamp\",\"type\":\"uint256\"}],\"name\":\"AlertInvalidRate\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"tvl\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"timestamp\",\"type\":\"uint256\"}],\"name\":\"AlertInvalidTVL\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"previousTVL\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"newTVL\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"timestamp\",\"type\":\"uint256\"}],\"name\":\"AlertInvalidTVLDifference\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"uint64\",\"name\":\"version\",\"type\":\"uint64\"}],\"name\":\"Initialized\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"maxDifferencePercent\",\"type\":\"uint256\"}],\"name\":\"MaxDifferencePercentSet\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"int192\",\"name\":\"maxRate\",\"type\":\"int192\"}],\"name\":\"MaxRateSet\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"int192\",\"name\":\"minRate\",\"type\":\"int192\"}],\"name\":\"MinRateSet\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"previousOwner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"OwnershipTransferStarted\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"previousOwner\",\"type\":\"address\"},{\"indexed\":true,\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"OwnershipTransferred\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"Paused\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"int192\",\"name\":\"rate\",\"type\":\"int192\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"totalSupply\",\"type\":\"uint256\"},{\"indexed\":false,\"internalType\":\"uint256\",\"name\":\"totalTVL\",\"type\":\"uint256\"},{\"indexed\":true,\"internalType\":\"uint256\",\"name\":\"timestamp\",\"type\":\"uint256\"}],\"name\":\"RateUpdated\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":false,\"internalType\":\"address\",\"name\":\"account\",\"type\":\"address\"}],\"name\":\"Unpaused\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"updater\",\"type\":\"address\"}],\"name\":\"UpdaterSet\",\"type\":\"event\"},{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"internalType\":\"address\",\"name\":\"implementation\",\"type\":\"address\"}],\"name\":\"Upgraded\",\"type\":\"event\"},{\"inputs\":[],\"name\":\"RATE_PRECISION\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"UPGRADE_INTERFACE_VERSION\",\"outputs\":[{\"internalType\":\"string\",\"name\":\"\",\"type\":\"string\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"acceptOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getLatestTVL\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getLatestTotalSupply\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getLatestUpdateTime\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getMaxDifferencePercent\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getMaxRate\",\"outputs\":[{\"internalType\":\"int192\",\"name\":\"\",\"type\":\"int192\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getMinRate\",\"outputs\":[{\"internalType\":\"int192\",\"name\":\"\",\"type\":\"int192\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getRate\",\"outputs\":[{\"internalType\":\"int192\",\"name\":\"\",\"type\":\"int192\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getUpdater\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"owner_\",\"type\":\"address\"},{\"internalType\":\"address\",\"name\":\"updater_\",\"type\":\"address\"},{\"internalType\":\"uint256\",\"name\":\"maxDifferencePercent_\",\"type\":\"uint256\"},{\"internalType\":\"int192\",\"name\":\"minRate_\",\"type\":\"int192\"},{\"internalType\":\"int192\",\"name\":\"maxRate_\",\"type\":\"int192\"}],\"name\":\"initialize\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"owner\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"pause\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"paused\",\"outputs\":[{\"internalType\":\"bool\",\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"pendingOwner\",\"outputs\":[{\"internalType\":\"address\",\"name\":\"\",\"type\":\"address\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"proxiableUUID\",\"outputs\":[{\"internalType\":\"bytes32\",\"name\":\"\",\"type\":\"bytes32\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"renounceOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"maxDifferencePercent_\",\"type\":\"uint256\"}],\"name\":\"setMaxDifferencePercent\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"int192\",\"name\":\"maxRate_\",\"type\":\"int192\"}],\"name\":\"setMaxRate\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"int192\",\"name\":\"minRate_\",\"type\":\"int192\"}],\"name\":\"setMinRate\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"updater_\",\"type\":\"address\"}],\"name\":\"setUpdater\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"newOwner\",\"type\":\"address\"}],\"name\":\"transferOwnership\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"unpause\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"totalSupply_\",\"type\":\"uint256\"},{\"internalType\":\"uint256\",\"name\":\"totalTVL_\",\"type\":\"uint256\"}],\"name\":\"updateRate\",\"outputs\":[{\"internalType\":\"int192\",\"name\":\"\",\"type\":\"int192\"}],\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"address\",\"name\":\"newImplementation\",\"type\":\"address\"},{\"internalType\":\"bytes\",\"name\":\"data\",\"type\":\"bytes\"}],\"name\":\"upgradeToAndCall\",\"outputs\":[],\"stateMutability\":\"payable\",\"type\":\"function\"}]",
}

// NavEngineABI is the input ABI used to generate the binding from.
// Deprecated: Use NavEngineMetaData.ABI instead.
var NavEngineABI = NavEngineMetaData.ABI

// NavEngine is an auto generated Go binding around an Ethereum contract.
type NavEngine struct {
	NavEngineCaller     // Read-only binding to the contract
	NavEngineTransactor // Write-only binding to the contract
	NavEngineFilterer   // Log filterer for contract events
}

// NavEngineCaller is an auto generated read-only Go binding around an Ethereum contract.
type NavEngineCaller struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// NavEngineTransactor is an auto generated write-only Go binding around an Ethereum contract.
type NavEngineTransactor struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// NavEngineFilterer is an auto generated log filtering Go binding around an Ethereum contract events.
type NavEngineFilterer struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// NavEngineSession is an auto generated Go binding around an Ethereum contract,
// with pre-set call and transact options.
type NavEngineSession struct {
	Contract     *NavEngine        // Generic contract binding to set the session for
	CallOpts     bind.CallOpts     // Call options to use throughout this session
	TransactOpts bind.TransactOpts // Transaction auth options to use throughout this session
}

// NavEngineCallerSession is an auto generated read-only Go binding around an Ethereum contract,
// with pre-set call options.
type NavEngineCallerSession struct {
	Contract *NavEngineCaller // Generic contract caller binding to set the session for
	CallOpts bind.CallOpts    // Call options to use throughout this session
}

// NavEngineTransactorSession is an auto generated write-only Go binding around an Ethereum contract,
// with pre-set transact options.
type NavEngineTransactorSession struct {
	Contract     *NavEngineTransactor // Generic contract transactor binding to set the session for
	TransactOpts bind.TransactOpts    // Transaction auth options to use throughout this session
}

// NavEngineRaw is an auto generated low-level Go binding around an Ethereum contract.
type NavEngineRaw struct {
	Contract *NavEngine // Generic contract binding to access the raw methods on
}

// NavEngineCallerRaw is an auto generated low-level read-only Go binding around an Ethereum contract.
type NavEngineCallerRaw struct {
	Contract *NavEngineCaller // Generic read-only contract binding to access the raw methods on
}

// NavEngineTransactorRaw is an auto generated low-level write-only Go binding around an Ethereum contract.
type NavEngineTransactorRaw struct {
	Contract *NavEngineTransactor // Generic write-only contract binding to access the raw methods on
}

// NewNavEngine creates a new instance of NavEngine, bound to a specific deployed contract.
func NewNavEngine(address common.Address, backend bind.ContractBackend) (*NavEngine, error) {
	contract, err := bindNavEngine(address, backend, backend, backend)
	if err != nil {
		return nil, err
	}
	return &NavEngine{NavEngineCaller: NavEngineCaller{contract: contract}, NavEngineTransactor: NavEngineTransactor{contract: contract}, NavEngineFilterer: NavEngineFilterer{contract: contract}}, nil
}

// NewNavEngineCaller creates a new read-only instance of NavEngine, bound to a specific deployed contract.
func NewNavEngineCaller(address common.Address, caller bind.ContractCaller) (*NavEngineCaller, error) {
	contract, err := bindNavEngine(address, caller, nil, nil)
	if err != nil {
		return nil, err
	}
	return &NavEngineCaller{contract: contract}, nil
}

// NewNavEngineTransactor creates a new write-only instance of NavEngine, bound to a specific deployed contract.
func NewNavEngineTransactor(address common.Address, transactor bind.ContractTransactor) (*NavEngineTransactor, error) {
	contract, err := bindNavEngine(address, nil, transactor, nil)
	if err != nil {
		return nil, err
	}
	return &NavEngineTransactor{contract: contract}, nil
}

// NewNavEngineFilterer creates a new log filterer instance of NavEngine, bound to a specific deployed contract.
func NewNavEngineFilterer(address common.Address, filterer bind.ContractFilterer) (*NavEngineFilterer, error) {
	contract, err := bindNavEngine(address, nil, nil, filterer)
	if err != nil {
		return nil, err
	}
	return &NavEngineFilterer{contract: contract}, nil
}

// bindNavEngine binds a generic wrapper to an already deployed contract.
func bindNavEngine(address common.Address, caller bind.ContractCaller, transactor bind.ContractTransactor, filterer bind.ContractFilterer) (*bind.BoundContract, error) {
	parsed, err := NavEngineMetaData.GetAbi()
	if err != nil {
		return nil, err
	}
	return bind.NewBoundContract(address, *parsed, caller, transactor, filterer), nil
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_NavEngine *NavEngineRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _NavEngine.Contract.NavEngineCaller.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_NavEngine *NavEngineRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.Contract.NavEngineTransactor.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_NavEngine *NavEngineRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _NavEngine.Contract.NavEngineTransactor.contract.Transact(opts, method, params...)
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_NavEngine *NavEngineCallerRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _NavEngine.Contract.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_NavEngine *NavEngineTransactorRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.Contract.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_NavEngine *NavEngineTransactorRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _NavEngine.Contract.contract.Transact(opts, method, params...)
}

// RATEPRECISION is a free data retrieval call binding the contract method 0x2b3ba681.
//
// Solidity: function RATE_PRECISION() view returns(uint256)
func (_NavEngine *NavEngineCaller) RATEPRECISION(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "RATE_PRECISION")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// RATEPRECISION is a free data retrieval call binding the contract method 0x2b3ba681.
//
// Solidity: function RATE_PRECISION() view returns(uint256)
func (_NavEngine *NavEngineSession) RATEPRECISION() (*big.Int, error) {
	return _NavEngine.Contract.RATEPRECISION(&_NavEngine.CallOpts)
}

// RATEPRECISION is a free data retrieval call binding the contract method 0x2b3ba681.
//
// Solidity: function RATE_PRECISION() view returns(uint256)
func (_NavEngine *NavEngineCallerSession) RATEPRECISION() (*big.Int, error) {
	return _NavEngine.Contract.RATEPRECISION(&_NavEngine.CallOpts)
}

// UPGRADEINTERFACEVERSION is a free data retrieval call binding the contract method 0xad3cb1cc.
//
// Solidity: function UPGRADE_INTERFACE_VERSION() view returns(string)
func (_NavEngine *NavEngineCaller) UPGRADEINTERFACEVERSION(opts *bind.CallOpts) (string, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "UPGRADE_INTERFACE_VERSION")

	if err != nil {
		return *new(string), err
	}

	out0 := *abi.ConvertType(out[0], new(string)).(*string)

	return out0, err

}

// UPGRADEINTERFACEVERSION is a free data retrieval call binding the contract method 0xad3cb1cc.
//
// Solidity: function UPGRADE_INTERFACE_VERSION() view returns(string)
func (_NavEngine *NavEngineSession) UPGRADEINTERFACEVERSION() (string, error) {
	return _NavEngine.Contract.UPGRADEINTERFACEVERSION(&_NavEngine.CallOpts)
}

// UPGRADEINTERFACEVERSION is a free data retrieval call binding the contract method 0xad3cb1cc.
//
// Solidity: function UPGRADE_INTERFACE_VERSION() view returns(string)
func (_NavEngine *NavEngineCallerSession) UPGRADEINTERFACEVERSION() (string, error) {
	return _NavEngine.Contract.UPGRADEINTERFACEVERSION(&_NavEngine.CallOpts)
}

// GetLatestTVL is a free data retrieval call binding the contract method 0x257d7698.
//
// Solidity: function getLatestTVL() view returns(uint256)
func (_NavEngine *NavEngineCaller) GetLatestTVL(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getLatestTVL")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetLatestTVL is a free data retrieval call binding the contract method 0x257d7698.
//
// Solidity: function getLatestTVL() view returns(uint256)
func (_NavEngine *NavEngineSession) GetLatestTVL() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestTVL(&_NavEngine.CallOpts)
}

// GetLatestTVL is a free data retrieval call binding the contract method 0x257d7698.
//
// Solidity: function getLatestTVL() view returns(uint256)
func (_NavEngine *NavEngineCallerSession) GetLatestTVL() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestTVL(&_NavEngine.CallOpts)
}

// GetLatestTotalSupply is a free data retrieval call binding the contract method 0xce368761.
//
// Solidity: function getLatestTotalSupply() view returns(uint256)
func (_NavEngine *NavEngineCaller) GetLatestTotalSupply(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getLatestTotalSupply")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetLatestTotalSupply is a free data retrieval call binding the contract method 0xce368761.
//
// Solidity: function getLatestTotalSupply() view returns(uint256)
func (_NavEngine *NavEngineSession) GetLatestTotalSupply() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestTotalSupply(&_NavEngine.CallOpts)
}

// GetLatestTotalSupply is a free data retrieval call binding the contract method 0xce368761.
//
// Solidity: function getLatestTotalSupply() view returns(uint256)
func (_NavEngine *NavEngineCallerSession) GetLatestTotalSupply() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestTotalSupply(&_NavEngine.CallOpts)
}

// GetLatestUpdateTime is a free data retrieval call binding the contract method 0x2461d19c.
//
// Solidity: function getLatestUpdateTime() view returns(uint256)
func (_NavEngine *NavEngineCaller) GetLatestUpdateTime(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getLatestUpdateTime")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetLatestUpdateTime is a free data retrieval call binding the contract method 0x2461d19c.
//
// Solidity: function getLatestUpdateTime() view returns(uint256)
func (_NavEngine *NavEngineSession) GetLatestUpdateTime() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestUpdateTime(&_NavEngine.CallOpts)
}

// GetLatestUpdateTime is a free data retrieval call binding the contract method 0x2461d19c.
//
// Solidity: function getLatestUpdateTime() view returns(uint256)
func (_NavEngine *NavEngineCallerSession) GetLatestUpdateTime() (*big.Int, error) {
	return _NavEngine.Contract.GetLatestUpdateTime(&_NavEngine.CallOpts)
}

// GetMaxDifferencePercent is a free data retrieval call binding the contract method 0x6f4de223.
//
// Solidity: function getMaxDifferencePercent() view returns(uint256)
func (_NavEngine *NavEngineCaller) GetMaxDifferencePercent(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getMaxDifferencePercent")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetMaxDifferencePercent is a free data retrieval call binding the contract method 0x6f4de223.
//
// Solidity: function getMaxDifferencePercent() view returns(uint256)
func (_NavEngine *NavEngineSession) GetMaxDifferencePercent() (*big.Int, error) {
	return _NavEngine.Contract.GetMaxDifferencePercent(&_NavEngine.CallOpts)
}

// GetMaxDifferencePercent is a free data retrieval call binding the contract method 0x6f4de223.
//
// Solidity: function getMaxDifferencePercent() view returns(uint256)
func (_NavEngine *NavEngineCallerSession) GetMaxDifferencePercent() (*big.Int, error) {
	return _NavEngine.Contract.GetMaxDifferencePercent(&_NavEngine.CallOpts)
}

// GetMaxRate is a free data retrieval call binding the contract method 0xd2a6e002.
//
// Solidity: function getMaxRate() view returns(int192)
func (_NavEngine *NavEngineCaller) GetMaxRate(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getMaxRate")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetMaxRate is a free data retrieval call binding the contract method 0xd2a6e002.
//
// Solidity: function getMaxRate() view returns(int192)
func (_NavEngine *NavEngineSession) GetMaxRate() (*big.Int, error) {
	return _NavEngine.Contract.GetMaxRate(&_NavEngine.CallOpts)
}

// GetMaxRate is a free data retrieval call binding the contract method 0xd2a6e002.
//
// Solidity: function getMaxRate() view returns(int192)
func (_NavEngine *NavEngineCallerSession) GetMaxRate() (*big.Int, error) {
	return _NavEngine.Contract.GetMaxRate(&_NavEngine.CallOpts)
}

// GetMinRate is a free data retrieval call binding the contract method 0x17792678.
//
// Solidity: function getMinRate() view returns(int192)
func (_NavEngine *NavEngineCaller) GetMinRate(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getMinRate")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetMinRate is a free data retrieval call binding the contract method 0x17792678.
//
// Solidity: function getMinRate() view returns(int192)
func (_NavEngine *NavEngineSession) GetMinRate() (*big.Int, error) {
	return _NavEngine.Contract.GetMinRate(&_NavEngine.CallOpts)
}

// GetMinRate is a free data retrieval call binding the contract method 0x17792678.
//
// Solidity: function getMinRate() view returns(int192)
func (_NavEngine *NavEngineCallerSession) GetMinRate() (*big.Int, error) {
	return _NavEngine.Contract.GetMinRate(&_NavEngine.CallOpts)
}

// GetRate is a free data retrieval call binding the contract method 0x679aefce.
//
// Solidity: function getRate() view returns(int192)
func (_NavEngine *NavEngineCaller) GetRate(opts *bind.CallOpts) (*big.Int, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getRate")

	if err != nil {
		return *new(*big.Int), err
	}

	out0 := *abi.ConvertType(out[0], new(*big.Int)).(**big.Int)

	return out0, err

}

// GetRate is a free data retrieval call binding the contract method 0x679aefce.
//
// Solidity: function getRate() view returns(int192)
func (_NavEngine *NavEngineSession) GetRate() (*big.Int, error) {
	return _NavEngine.Contract.GetRate(&_NavEngine.CallOpts)
}

// GetRate is a free data retrieval call binding the contract method 0x679aefce.
//
// Solidity: function getRate() view returns(int192)
func (_NavEngine *NavEngineCallerSession) GetRate() (*big.Int, error) {
	return _NavEngine.Contract.GetRate(&_NavEngine.CallOpts)
}

// GetUpdater is a free data retrieval call binding the contract method 0x99d54d39.
//
// Solidity: function getUpdater() view returns(address)
func (_NavEngine *NavEngineCaller) GetUpdater(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "getUpdater")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// GetUpdater is a free data retrieval call binding the contract method 0x99d54d39.
//
// Solidity: function getUpdater() view returns(address)
func (_NavEngine *NavEngineSession) GetUpdater() (common.Address, error) {
	return _NavEngine.Contract.GetUpdater(&_NavEngine.CallOpts)
}

// GetUpdater is a free data retrieval call binding the contract method 0x99d54d39.
//
// Solidity: function getUpdater() view returns(address)
func (_NavEngine *NavEngineCallerSession) GetUpdater() (common.Address, error) {
	return _NavEngine.Contract.GetUpdater(&_NavEngine.CallOpts)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_NavEngine *NavEngineCaller) Owner(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "owner")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_NavEngine *NavEngineSession) Owner() (common.Address, error) {
	return _NavEngine.Contract.Owner(&_NavEngine.CallOpts)
}

// Owner is a free data retrieval call binding the contract method 0x8da5cb5b.
//
// Solidity: function owner() view returns(address)
func (_NavEngine *NavEngineCallerSession) Owner() (common.Address, error) {
	return _NavEngine.Contract.Owner(&_NavEngine.CallOpts)
}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_NavEngine *NavEngineCaller) Paused(opts *bind.CallOpts) (bool, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "paused")

	if err != nil {
		return *new(bool), err
	}

	out0 := *abi.ConvertType(out[0], new(bool)).(*bool)

	return out0, err

}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_NavEngine *NavEngineSession) Paused() (bool, error) {
	return _NavEngine.Contract.Paused(&_NavEngine.CallOpts)
}

// Paused is a free data retrieval call binding the contract method 0x5c975abb.
//
// Solidity: function paused() view returns(bool)
func (_NavEngine *NavEngineCallerSession) Paused() (bool, error) {
	return _NavEngine.Contract.Paused(&_NavEngine.CallOpts)
}

// PendingOwner is a free data retrieval call binding the contract method 0xe30c3978.
//
// Solidity: function pendingOwner() view returns(address)
func (_NavEngine *NavEngineCaller) PendingOwner(opts *bind.CallOpts) (common.Address, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "pendingOwner")

	if err != nil {
		return *new(common.Address), err
	}

	out0 := *abi.ConvertType(out[0], new(common.Address)).(*common.Address)

	return out0, err

}

// PendingOwner is a free data retrieval call binding the contract method 0xe30c3978.
//
// Solidity: function pendingOwner() view returns(address)
func (_NavEngine *NavEngineSession) PendingOwner() (common.Address, error) {
	return _NavEngine.Contract.PendingOwner(&_NavEngine.CallOpts)
}

// PendingOwner is a free data retrieval call binding the contract method 0xe30c3978.
//
// Solidity: function pendingOwner() view returns(address)
func (_NavEngine *NavEngineCallerSession) PendingOwner() (common.Address, error) {
	return _NavEngine.Contract.PendingOwner(&_NavEngine.CallOpts)
}

// ProxiableUUID is a free data retrieval call binding the contract method 0x52d1902d.
//
// Solidity: function proxiableUUID() view returns(bytes32)
func (_NavEngine *NavEngineCaller) ProxiableUUID(opts *bind.CallOpts) ([32]byte, error) {
	var out []interface{}
	err := _NavEngine.contract.Call(opts, &out, "proxiableUUID")

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// ProxiableUUID is a free data retrieval call binding the contract method 0x52d1902d.
//
// Solidity: function proxiableUUID() view returns(bytes32)
func (_NavEngine *NavEngineSession) ProxiableUUID() ([32]byte, error) {
	return _NavEngine.Contract.ProxiableUUID(&_NavEngine.CallOpts)
}

// ProxiableUUID is a free data retrieval call binding the contract method 0x52d1902d.
//
// Solidity: function proxiableUUID() view returns(bytes32)
func (_NavEngine *NavEngineCallerSession) ProxiableUUID() ([32]byte, error) {
	return _NavEngine.Contract.ProxiableUUID(&_NavEngine.CallOpts)
}

// AcceptOwnership is a paid mutator transaction binding the contract method 0x79ba5097.
//
// Solidity: function acceptOwnership() returns()
func (_NavEngine *NavEngineTransactor) AcceptOwnership(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "acceptOwnership")
}

// AcceptOwnership is a paid mutator transaction binding the contract method 0x79ba5097.
//
// Solidity: function acceptOwnership() returns()
func (_NavEngine *NavEngineSession) AcceptOwnership() (*types.Transaction, error) {
	return _NavEngine.Contract.AcceptOwnership(&_NavEngine.TransactOpts)
}

// AcceptOwnership is a paid mutator transaction binding the contract method 0x79ba5097.
//
// Solidity: function acceptOwnership() returns()
func (_NavEngine *NavEngineTransactorSession) AcceptOwnership() (*types.Transaction, error) {
	return _NavEngine.Contract.AcceptOwnership(&_NavEngine.TransactOpts)
}

// Initialize is a paid mutator transaction binding the contract method 0x55da5143.
//
// Solidity: function initialize(address owner_, address updater_, uint256 maxDifferencePercent_, int192 minRate_, int192 maxRate_) returns()
func (_NavEngine *NavEngineTransactor) Initialize(opts *bind.TransactOpts, owner_ common.Address, updater_ common.Address, maxDifferencePercent_ *big.Int, minRate_ *big.Int, maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "initialize", owner_, updater_, maxDifferencePercent_, minRate_, maxRate_)
}

// Initialize is a paid mutator transaction binding the contract method 0x55da5143.
//
// Solidity: function initialize(address owner_, address updater_, uint256 maxDifferencePercent_, int192 minRate_, int192 maxRate_) returns()
func (_NavEngine *NavEngineSession) Initialize(owner_ common.Address, updater_ common.Address, maxDifferencePercent_ *big.Int, minRate_ *big.Int, maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.Initialize(&_NavEngine.TransactOpts, owner_, updater_, maxDifferencePercent_, minRate_, maxRate_)
}

// Initialize is a paid mutator transaction binding the contract method 0x55da5143.
//
// Solidity: function initialize(address owner_, address updater_, uint256 maxDifferencePercent_, int192 minRate_, int192 maxRate_) returns()
func (_NavEngine *NavEngineTransactorSession) Initialize(owner_ common.Address, updater_ common.Address, maxDifferencePercent_ *big.Int, minRate_ *big.Int, maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.Initialize(&_NavEngine.TransactOpts, owner_, updater_, maxDifferencePercent_, minRate_, maxRate_)
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_NavEngine *NavEngineTransactor) Pause(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "pause")
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_NavEngine *NavEngineSession) Pause() (*types.Transaction, error) {
	return _NavEngine.Contract.Pause(&_NavEngine.TransactOpts)
}

// Pause is a paid mutator transaction binding the contract method 0x8456cb59.
//
// Solidity: function pause() returns()
func (_NavEngine *NavEngineTransactorSession) Pause() (*types.Transaction, error) {
	return _NavEngine.Contract.Pause(&_NavEngine.TransactOpts)
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_NavEngine *NavEngineTransactor) RenounceOwnership(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "renounceOwnership")
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_NavEngine *NavEngineSession) RenounceOwnership() (*types.Transaction, error) {
	return _NavEngine.Contract.RenounceOwnership(&_NavEngine.TransactOpts)
}

// RenounceOwnership is a paid mutator transaction binding the contract method 0x715018a6.
//
// Solidity: function renounceOwnership() returns()
func (_NavEngine *NavEngineTransactorSession) RenounceOwnership() (*types.Transaction, error) {
	return _NavEngine.Contract.RenounceOwnership(&_NavEngine.TransactOpts)
}

// SetMaxDifferencePercent is a paid mutator transaction binding the contract method 0x3c455647.
//
// Solidity: function setMaxDifferencePercent(uint256 maxDifferencePercent_) returns()
func (_NavEngine *NavEngineTransactor) SetMaxDifferencePercent(opts *bind.TransactOpts, maxDifferencePercent_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "setMaxDifferencePercent", maxDifferencePercent_)
}

// SetMaxDifferencePercent is a paid mutator transaction binding the contract method 0x3c455647.
//
// Solidity: function setMaxDifferencePercent(uint256 maxDifferencePercent_) returns()
func (_NavEngine *NavEngineSession) SetMaxDifferencePercent(maxDifferencePercent_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMaxDifferencePercent(&_NavEngine.TransactOpts, maxDifferencePercent_)
}

// SetMaxDifferencePercent is a paid mutator transaction binding the contract method 0x3c455647.
//
// Solidity: function setMaxDifferencePercent(uint256 maxDifferencePercent_) returns()
func (_NavEngine *NavEngineTransactorSession) SetMaxDifferencePercent(maxDifferencePercent_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMaxDifferencePercent(&_NavEngine.TransactOpts, maxDifferencePercent_)
}

// SetMaxRate is a paid mutator transaction binding the contract method 0x67a86a6f.
//
// Solidity: function setMaxRate(int192 maxRate_) returns()
func (_NavEngine *NavEngineTransactor) SetMaxRate(opts *bind.TransactOpts, maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "setMaxRate", maxRate_)
}

// SetMaxRate is a paid mutator transaction binding the contract method 0x67a86a6f.
//
// Solidity: function setMaxRate(int192 maxRate_) returns()
func (_NavEngine *NavEngineSession) SetMaxRate(maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMaxRate(&_NavEngine.TransactOpts, maxRate_)
}

// SetMaxRate is a paid mutator transaction binding the contract method 0x67a86a6f.
//
// Solidity: function setMaxRate(int192 maxRate_) returns()
func (_NavEngine *NavEngineTransactorSession) SetMaxRate(maxRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMaxRate(&_NavEngine.TransactOpts, maxRate_)
}

// SetMinRate is a paid mutator transaction binding the contract method 0x76964908.
//
// Solidity: function setMinRate(int192 minRate_) returns()
func (_NavEngine *NavEngineTransactor) SetMinRate(opts *bind.TransactOpts, minRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "setMinRate", minRate_)
}

// SetMinRate is a paid mutator transaction binding the contract method 0x76964908.
//
// Solidity: function setMinRate(int192 minRate_) returns()
func (_NavEngine *NavEngineSession) SetMinRate(minRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMinRate(&_NavEngine.TransactOpts, minRate_)
}

// SetMinRate is a paid mutator transaction binding the contract method 0x76964908.
//
// Solidity: function setMinRate(int192 minRate_) returns()
func (_NavEngine *NavEngineTransactorSession) SetMinRate(minRate_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.SetMinRate(&_NavEngine.TransactOpts, minRate_)
}

// SetUpdater is a paid mutator transaction binding the contract method 0x9d54f419.
//
// Solidity: function setUpdater(address updater_) returns()
func (_NavEngine *NavEngineTransactor) SetUpdater(opts *bind.TransactOpts, updater_ common.Address) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "setUpdater", updater_)
}

// SetUpdater is a paid mutator transaction binding the contract method 0x9d54f419.
//
// Solidity: function setUpdater(address updater_) returns()
func (_NavEngine *NavEngineSession) SetUpdater(updater_ common.Address) (*types.Transaction, error) {
	return _NavEngine.Contract.SetUpdater(&_NavEngine.TransactOpts, updater_)
}

// SetUpdater is a paid mutator transaction binding the contract method 0x9d54f419.
//
// Solidity: function setUpdater(address updater_) returns()
func (_NavEngine *NavEngineTransactorSession) SetUpdater(updater_ common.Address) (*types.Transaction, error) {
	return _NavEngine.Contract.SetUpdater(&_NavEngine.TransactOpts, updater_)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_NavEngine *NavEngineTransactor) TransferOwnership(opts *bind.TransactOpts, newOwner common.Address) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "transferOwnership", newOwner)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_NavEngine *NavEngineSession) TransferOwnership(newOwner common.Address) (*types.Transaction, error) {
	return _NavEngine.Contract.TransferOwnership(&_NavEngine.TransactOpts, newOwner)
}

// TransferOwnership is a paid mutator transaction binding the contract method 0xf2fde38b.
//
// Solidity: function transferOwnership(address newOwner) returns()
func (_NavEngine *NavEngineTransactorSession) TransferOwnership(newOwner common.Address) (*types.Transaction, error) {
	return _NavEngine.Contract.TransferOwnership(&_NavEngine.TransactOpts, newOwner)
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_NavEngine *NavEngineTransactor) Unpause(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "unpause")
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_NavEngine *NavEngineSession) Unpause() (*types.Transaction, error) {
	return _NavEngine.Contract.Unpause(&_NavEngine.TransactOpts)
}

// Unpause is a paid mutator transaction binding the contract method 0x3f4ba83a.
//
// Solidity: function unpause() returns()
func (_NavEngine *NavEngineTransactorSession) Unpause() (*types.Transaction, error) {
	return _NavEngine.Contract.Unpause(&_NavEngine.TransactOpts)
}

// UpdateRate is a paid mutator transaction binding the contract method 0x405abb41.
//
// Solidity: function updateRate(uint256 totalSupply_, uint256 totalTVL_) returns(int192)
func (_NavEngine *NavEngineTransactor) UpdateRate(opts *bind.TransactOpts, totalSupply_ *big.Int, totalTVL_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "updateRate", totalSupply_, totalTVL_)
}

// UpdateRate is a paid mutator transaction binding the contract method 0x405abb41.
//
// Solidity: function updateRate(uint256 totalSupply_, uint256 totalTVL_) returns(int192)
func (_NavEngine *NavEngineSession) UpdateRate(totalSupply_ *big.Int, totalTVL_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.UpdateRate(&_NavEngine.TransactOpts, totalSupply_, totalTVL_)
}

// UpdateRate is a paid mutator transaction binding the contract method 0x405abb41.
//
// Solidity: function updateRate(uint256 totalSupply_, uint256 totalTVL_) returns(int192)
func (_NavEngine *NavEngineTransactorSession) UpdateRate(totalSupply_ *big.Int, totalTVL_ *big.Int) (*types.Transaction, error) {
	return _NavEngine.Contract.UpdateRate(&_NavEngine.TransactOpts, totalSupply_, totalTVL_)
}

// UpgradeToAndCall is a paid mutator transaction binding the contract method 0x4f1ef286.
//
// Solidity: function upgradeToAndCall(address newImplementation, bytes data) payable returns()
func (_NavEngine *NavEngineTransactor) UpgradeToAndCall(opts *bind.TransactOpts, newImplementation common.Address, data []byte) (*types.Transaction, error) {
	return _NavEngine.contract.Transact(opts, "upgradeToAndCall", newImplementation, data)
}

// UpgradeToAndCall is a paid mutator transaction binding the contract method 0x4f1ef286.
//
// Solidity: function upgradeToAndCall(address newImplementation, bytes data) payable returns()
func (_NavEngine *NavEngineSession) UpgradeToAndCall(newImplementation common.Address, data []byte) (*types.Transaction, error) {
	return _NavEngine.Contract.UpgradeToAndCall(&_NavEngine.TransactOpts, newImplementation, data)
}

// UpgradeToAndCall is a paid mutator transaction binding the contract method 0x4f1ef286.
//
// Solidity: function upgradeToAndCall(address newImplementation, bytes data) payable returns()
func (_NavEngine *NavEngineTransactorSession) UpgradeToAndCall(newImplementation common.Address, data []byte) (*types.Transaction, error) {
	return _NavEngine.Contract.UpgradeToAndCall(&_NavEngine.TransactOpts, newImplementation, data)
}

// NavEngineAlertInvalidRateIterator is returned from FilterAlertInvalidRate and is used to iterate over the raw logs and unpacked data for AlertInvalidRate events raised by the NavEngine contract.
type NavEngineAlertInvalidRateIterator struct {
	Event *NavEngineAlertInvalidRate // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineAlertInvalidRateIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineAlertInvalidRate)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineAlertInvalidRate)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineAlertInvalidRateIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineAlertInvalidRateIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineAlertInvalidRate represents a AlertInvalidRate event raised by the NavEngine contract.
type NavEngineAlertInvalidRate struct {
	Rate      *big.Int
	Timestamp *big.Int
	Raw       types.Log // Blockchain specific contextual infos
}

// FilterAlertInvalidRate is a free log retrieval operation binding the contract event 0x99d7ec323592802ca367e8eb2c03d0002ba3de7c56543d6dea1b6f9c7aae98ad.
//
// Solidity: event AlertInvalidRate(int192 indexed rate, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) FilterAlertInvalidRate(opts *bind.FilterOpts, rate []*big.Int, timestamp []*big.Int) (*NavEngineAlertInvalidRateIterator, error) {

	var rateRule []interface{}
	for _, rateItem := range rate {
		rateRule = append(rateRule, rateItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "AlertInvalidRate", rateRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineAlertInvalidRateIterator{contract: _NavEngine.contract, event: "AlertInvalidRate", logs: logs, sub: sub}, nil
}

// WatchAlertInvalidRate is a free log subscription operation binding the contract event 0x99d7ec323592802ca367e8eb2c03d0002ba3de7c56543d6dea1b6f9c7aae98ad.
//
// Solidity: event AlertInvalidRate(int192 indexed rate, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) WatchAlertInvalidRate(opts *bind.WatchOpts, sink chan<- *NavEngineAlertInvalidRate, rate []*big.Int, timestamp []*big.Int) (event.Subscription, error) {

	var rateRule []interface{}
	for _, rateItem := range rate {
		rateRule = append(rateRule, rateItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "AlertInvalidRate", rateRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineAlertInvalidRate)
				if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidRate", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAlertInvalidRate is a log parse operation binding the contract event 0x99d7ec323592802ca367e8eb2c03d0002ba3de7c56543d6dea1b6f9c7aae98ad.
//
// Solidity: event AlertInvalidRate(int192 indexed rate, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) ParseAlertInvalidRate(log types.Log) (*NavEngineAlertInvalidRate, error) {
	event := new(NavEngineAlertInvalidRate)
	if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidRate", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineAlertInvalidTVLIterator is returned from FilterAlertInvalidTVL and is used to iterate over the raw logs and unpacked data for AlertInvalidTVL events raised by the NavEngine contract.
type NavEngineAlertInvalidTVLIterator struct {
	Event *NavEngineAlertInvalidTVL // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineAlertInvalidTVLIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineAlertInvalidTVL)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineAlertInvalidTVL)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineAlertInvalidTVLIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineAlertInvalidTVLIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineAlertInvalidTVL represents a AlertInvalidTVL event raised by the NavEngine contract.
type NavEngineAlertInvalidTVL struct {
	Tvl       *big.Int
	Timestamp *big.Int
	Raw       types.Log // Blockchain specific contextual infos
}

// FilterAlertInvalidTVL is a free log retrieval operation binding the contract event 0x47beaf44768c6aed897659f82217d8f5a0b1b154cd64e5c413406223115051cc.
//
// Solidity: event AlertInvalidTVL(uint256 indexed tvl, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) FilterAlertInvalidTVL(opts *bind.FilterOpts, tvl []*big.Int, timestamp []*big.Int) (*NavEngineAlertInvalidTVLIterator, error) {

	var tvlRule []interface{}
	for _, tvlItem := range tvl {
		tvlRule = append(tvlRule, tvlItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "AlertInvalidTVL", tvlRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineAlertInvalidTVLIterator{contract: _NavEngine.contract, event: "AlertInvalidTVL", logs: logs, sub: sub}, nil
}

// WatchAlertInvalidTVL is a free log subscription operation binding the contract event 0x47beaf44768c6aed897659f82217d8f5a0b1b154cd64e5c413406223115051cc.
//
// Solidity: event AlertInvalidTVL(uint256 indexed tvl, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) WatchAlertInvalidTVL(opts *bind.WatchOpts, sink chan<- *NavEngineAlertInvalidTVL, tvl []*big.Int, timestamp []*big.Int) (event.Subscription, error) {

	var tvlRule []interface{}
	for _, tvlItem := range tvl {
		tvlRule = append(tvlRule, tvlItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "AlertInvalidTVL", tvlRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineAlertInvalidTVL)
				if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidTVL", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAlertInvalidTVL is a log parse operation binding the contract event 0x47beaf44768c6aed897659f82217d8f5a0b1b154cd64e5c413406223115051cc.
//
// Solidity: event AlertInvalidTVL(uint256 indexed tvl, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) ParseAlertInvalidTVL(log types.Log) (*NavEngineAlertInvalidTVL, error) {
	event := new(NavEngineAlertInvalidTVL)
	if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidTVL", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineAlertInvalidTVLDifferenceIterator is returned from FilterAlertInvalidTVLDifference and is used to iterate over the raw logs and unpacked data for AlertInvalidTVLDifference events raised by the NavEngine contract.
type NavEngineAlertInvalidTVLDifferenceIterator struct {
	Event *NavEngineAlertInvalidTVLDifference // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineAlertInvalidTVLDifferenceIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineAlertInvalidTVLDifference)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineAlertInvalidTVLDifference)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineAlertInvalidTVLDifferenceIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineAlertInvalidTVLDifferenceIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineAlertInvalidTVLDifference represents a AlertInvalidTVLDifference event raised by the NavEngine contract.
type NavEngineAlertInvalidTVLDifference struct {
	PreviousTVL *big.Int
	NewTVL      *big.Int
	Timestamp   *big.Int
	Raw         types.Log // Blockchain specific contextual infos
}

// FilterAlertInvalidTVLDifference is a free log retrieval operation binding the contract event 0xa7f624c02c98d8cfb6d220991e3fb640925d7e0bab5a3c57e9702faba2f15885.
//
// Solidity: event AlertInvalidTVLDifference(uint256 indexed previousTVL, uint256 indexed newTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) FilterAlertInvalidTVLDifference(opts *bind.FilterOpts, previousTVL []*big.Int, newTVL []*big.Int, timestamp []*big.Int) (*NavEngineAlertInvalidTVLDifferenceIterator, error) {

	var previousTVLRule []interface{}
	for _, previousTVLItem := range previousTVL {
		previousTVLRule = append(previousTVLRule, previousTVLItem)
	}
	var newTVLRule []interface{}
	for _, newTVLItem := range newTVL {
		newTVLRule = append(newTVLRule, newTVLItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "AlertInvalidTVLDifference", previousTVLRule, newTVLRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineAlertInvalidTVLDifferenceIterator{contract: _NavEngine.contract, event: "AlertInvalidTVLDifference", logs: logs, sub: sub}, nil
}

// WatchAlertInvalidTVLDifference is a free log subscription operation binding the contract event 0xa7f624c02c98d8cfb6d220991e3fb640925d7e0bab5a3c57e9702faba2f15885.
//
// Solidity: event AlertInvalidTVLDifference(uint256 indexed previousTVL, uint256 indexed newTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) WatchAlertInvalidTVLDifference(opts *bind.WatchOpts, sink chan<- *NavEngineAlertInvalidTVLDifference, previousTVL []*big.Int, newTVL []*big.Int, timestamp []*big.Int) (event.Subscription, error) {

	var previousTVLRule []interface{}
	for _, previousTVLItem := range previousTVL {
		previousTVLRule = append(previousTVLRule, previousTVLItem)
	}
	var newTVLRule []interface{}
	for _, newTVLItem := range newTVL {
		newTVLRule = append(newTVLRule, newTVLItem)
	}
	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "AlertInvalidTVLDifference", previousTVLRule, newTVLRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineAlertInvalidTVLDifference)
				if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidTVLDifference", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseAlertInvalidTVLDifference is a log parse operation binding the contract event 0xa7f624c02c98d8cfb6d220991e3fb640925d7e0bab5a3c57e9702faba2f15885.
//
// Solidity: event AlertInvalidTVLDifference(uint256 indexed previousTVL, uint256 indexed newTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) ParseAlertInvalidTVLDifference(log types.Log) (*NavEngineAlertInvalidTVLDifference, error) {
	event := new(NavEngineAlertInvalidTVLDifference)
	if err := _NavEngine.contract.UnpackLog(event, "AlertInvalidTVLDifference", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineInitializedIterator is returned from FilterInitialized and is used to iterate over the raw logs and unpacked data for Initialized events raised by the NavEngine contract.
type NavEngineInitializedIterator struct {
	Event *NavEngineInitialized // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineInitializedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineInitialized)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineInitialized)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineInitializedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineInitializedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineInitialized represents a Initialized event raised by the NavEngine contract.
type NavEngineInitialized struct {
	Version uint64
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterInitialized is a free log retrieval operation binding the contract event 0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2.
//
// Solidity: event Initialized(uint64 version)
func (_NavEngine *NavEngineFilterer) FilterInitialized(opts *bind.FilterOpts) (*NavEngineInitializedIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "Initialized")
	if err != nil {
		return nil, err
	}
	return &NavEngineInitializedIterator{contract: _NavEngine.contract, event: "Initialized", logs: logs, sub: sub}, nil
}

// WatchInitialized is a free log subscription operation binding the contract event 0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2.
//
// Solidity: event Initialized(uint64 version)
func (_NavEngine *NavEngineFilterer) WatchInitialized(opts *bind.WatchOpts, sink chan<- *NavEngineInitialized) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "Initialized")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineInitialized)
				if err := _NavEngine.contract.UnpackLog(event, "Initialized", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseInitialized is a log parse operation binding the contract event 0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2.
//
// Solidity: event Initialized(uint64 version)
func (_NavEngine *NavEngineFilterer) ParseInitialized(log types.Log) (*NavEngineInitialized, error) {
	event := new(NavEngineInitialized)
	if err := _NavEngine.contract.UnpackLog(event, "Initialized", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineMaxDifferencePercentSetIterator is returned from FilterMaxDifferencePercentSet and is used to iterate over the raw logs and unpacked data for MaxDifferencePercentSet events raised by the NavEngine contract.
type NavEngineMaxDifferencePercentSetIterator struct {
	Event *NavEngineMaxDifferencePercentSet // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineMaxDifferencePercentSetIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineMaxDifferencePercentSet)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineMaxDifferencePercentSet)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineMaxDifferencePercentSetIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineMaxDifferencePercentSetIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineMaxDifferencePercentSet represents a MaxDifferencePercentSet event raised by the NavEngine contract.
type NavEngineMaxDifferencePercentSet struct {
	MaxDifferencePercent *big.Int
	Raw                  types.Log // Blockchain specific contextual infos
}

// FilterMaxDifferencePercentSet is a free log retrieval operation binding the contract event 0xf359e37023687b9616eb1996f4e4d4a7cef694156730c46db4f0cc89253142f8.
//
// Solidity: event MaxDifferencePercentSet(uint256 maxDifferencePercent)
func (_NavEngine *NavEngineFilterer) FilterMaxDifferencePercentSet(opts *bind.FilterOpts) (*NavEngineMaxDifferencePercentSetIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "MaxDifferencePercentSet")
	if err != nil {
		return nil, err
	}
	return &NavEngineMaxDifferencePercentSetIterator{contract: _NavEngine.contract, event: "MaxDifferencePercentSet", logs: logs, sub: sub}, nil
}

// WatchMaxDifferencePercentSet is a free log subscription operation binding the contract event 0xf359e37023687b9616eb1996f4e4d4a7cef694156730c46db4f0cc89253142f8.
//
// Solidity: event MaxDifferencePercentSet(uint256 maxDifferencePercent)
func (_NavEngine *NavEngineFilterer) WatchMaxDifferencePercentSet(opts *bind.WatchOpts, sink chan<- *NavEngineMaxDifferencePercentSet) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "MaxDifferencePercentSet")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineMaxDifferencePercentSet)
				if err := _NavEngine.contract.UnpackLog(event, "MaxDifferencePercentSet", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseMaxDifferencePercentSet is a log parse operation binding the contract event 0xf359e37023687b9616eb1996f4e4d4a7cef694156730c46db4f0cc89253142f8.
//
// Solidity: event MaxDifferencePercentSet(uint256 maxDifferencePercent)
func (_NavEngine *NavEngineFilterer) ParseMaxDifferencePercentSet(log types.Log) (*NavEngineMaxDifferencePercentSet, error) {
	event := new(NavEngineMaxDifferencePercentSet)
	if err := _NavEngine.contract.UnpackLog(event, "MaxDifferencePercentSet", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineMaxRateSetIterator is returned from FilterMaxRateSet and is used to iterate over the raw logs and unpacked data for MaxRateSet events raised by the NavEngine contract.
type NavEngineMaxRateSetIterator struct {
	Event *NavEngineMaxRateSet // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineMaxRateSetIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineMaxRateSet)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineMaxRateSet)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineMaxRateSetIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineMaxRateSetIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineMaxRateSet represents a MaxRateSet event raised by the NavEngine contract.
type NavEngineMaxRateSet struct {
	MaxRate *big.Int
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterMaxRateSet is a free log retrieval operation binding the contract event 0x0bb0066e439bfcc43e4f26ebf15e12ec8784ff48d7e270d0905f407fde18393c.
//
// Solidity: event MaxRateSet(int192 maxRate)
func (_NavEngine *NavEngineFilterer) FilterMaxRateSet(opts *bind.FilterOpts) (*NavEngineMaxRateSetIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "MaxRateSet")
	if err != nil {
		return nil, err
	}
	return &NavEngineMaxRateSetIterator{contract: _NavEngine.contract, event: "MaxRateSet", logs: logs, sub: sub}, nil
}

// WatchMaxRateSet is a free log subscription operation binding the contract event 0x0bb0066e439bfcc43e4f26ebf15e12ec8784ff48d7e270d0905f407fde18393c.
//
// Solidity: event MaxRateSet(int192 maxRate)
func (_NavEngine *NavEngineFilterer) WatchMaxRateSet(opts *bind.WatchOpts, sink chan<- *NavEngineMaxRateSet) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "MaxRateSet")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineMaxRateSet)
				if err := _NavEngine.contract.UnpackLog(event, "MaxRateSet", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseMaxRateSet is a log parse operation binding the contract event 0x0bb0066e439bfcc43e4f26ebf15e12ec8784ff48d7e270d0905f407fde18393c.
//
// Solidity: event MaxRateSet(int192 maxRate)
func (_NavEngine *NavEngineFilterer) ParseMaxRateSet(log types.Log) (*NavEngineMaxRateSet, error) {
	event := new(NavEngineMaxRateSet)
	if err := _NavEngine.contract.UnpackLog(event, "MaxRateSet", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineMinRateSetIterator is returned from FilterMinRateSet and is used to iterate over the raw logs and unpacked data for MinRateSet events raised by the NavEngine contract.
type NavEngineMinRateSetIterator struct {
	Event *NavEngineMinRateSet // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineMinRateSetIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineMinRateSet)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineMinRateSet)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineMinRateSetIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineMinRateSetIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineMinRateSet represents a MinRateSet event raised by the NavEngine contract.
type NavEngineMinRateSet struct {
	MinRate *big.Int
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterMinRateSet is a free log retrieval operation binding the contract event 0x0401812f2fa2859a02411e3198a4725caaf6862e999e2be30f4cdb944cc523e3.
//
// Solidity: event MinRateSet(int192 minRate)
func (_NavEngine *NavEngineFilterer) FilterMinRateSet(opts *bind.FilterOpts) (*NavEngineMinRateSetIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "MinRateSet")
	if err != nil {
		return nil, err
	}
	return &NavEngineMinRateSetIterator{contract: _NavEngine.contract, event: "MinRateSet", logs: logs, sub: sub}, nil
}

// WatchMinRateSet is a free log subscription operation binding the contract event 0x0401812f2fa2859a02411e3198a4725caaf6862e999e2be30f4cdb944cc523e3.
//
// Solidity: event MinRateSet(int192 minRate)
func (_NavEngine *NavEngineFilterer) WatchMinRateSet(opts *bind.WatchOpts, sink chan<- *NavEngineMinRateSet) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "MinRateSet")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineMinRateSet)
				if err := _NavEngine.contract.UnpackLog(event, "MinRateSet", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseMinRateSet is a log parse operation binding the contract event 0x0401812f2fa2859a02411e3198a4725caaf6862e999e2be30f4cdb944cc523e3.
//
// Solidity: event MinRateSet(int192 minRate)
func (_NavEngine *NavEngineFilterer) ParseMinRateSet(log types.Log) (*NavEngineMinRateSet, error) {
	event := new(NavEngineMinRateSet)
	if err := _NavEngine.contract.UnpackLog(event, "MinRateSet", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineOwnershipTransferStartedIterator is returned from FilterOwnershipTransferStarted and is used to iterate over the raw logs and unpacked data for OwnershipTransferStarted events raised by the NavEngine contract.
type NavEngineOwnershipTransferStartedIterator struct {
	Event *NavEngineOwnershipTransferStarted // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineOwnershipTransferStartedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineOwnershipTransferStarted)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineOwnershipTransferStarted)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineOwnershipTransferStartedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineOwnershipTransferStartedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineOwnershipTransferStarted represents a OwnershipTransferStarted event raised by the NavEngine contract.
type NavEngineOwnershipTransferStarted struct {
	PreviousOwner common.Address
	NewOwner      common.Address
	Raw           types.Log // Blockchain specific contextual infos
}

// FilterOwnershipTransferStarted is a free log retrieval operation binding the contract event 0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700.
//
// Solidity: event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) FilterOwnershipTransferStarted(opts *bind.FilterOpts, previousOwner []common.Address, newOwner []common.Address) (*NavEngineOwnershipTransferStartedIterator, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "OwnershipTransferStarted", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineOwnershipTransferStartedIterator{contract: _NavEngine.contract, event: "OwnershipTransferStarted", logs: logs, sub: sub}, nil
}

// WatchOwnershipTransferStarted is a free log subscription operation binding the contract event 0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700.
//
// Solidity: event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) WatchOwnershipTransferStarted(opts *bind.WatchOpts, sink chan<- *NavEngineOwnershipTransferStarted, previousOwner []common.Address, newOwner []common.Address) (event.Subscription, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "OwnershipTransferStarted", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineOwnershipTransferStarted)
				if err := _NavEngine.contract.UnpackLog(event, "OwnershipTransferStarted", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseOwnershipTransferStarted is a log parse operation binding the contract event 0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700.
//
// Solidity: event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) ParseOwnershipTransferStarted(log types.Log) (*NavEngineOwnershipTransferStarted, error) {
	event := new(NavEngineOwnershipTransferStarted)
	if err := _NavEngine.contract.UnpackLog(event, "OwnershipTransferStarted", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineOwnershipTransferredIterator is returned from FilterOwnershipTransferred and is used to iterate over the raw logs and unpacked data for OwnershipTransferred events raised by the NavEngine contract.
type NavEngineOwnershipTransferredIterator struct {
	Event *NavEngineOwnershipTransferred // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineOwnershipTransferredIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineOwnershipTransferred)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineOwnershipTransferred)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineOwnershipTransferredIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineOwnershipTransferredIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineOwnershipTransferred represents a OwnershipTransferred event raised by the NavEngine contract.
type NavEngineOwnershipTransferred struct {
	PreviousOwner common.Address
	NewOwner      common.Address
	Raw           types.Log // Blockchain specific contextual infos
}

// FilterOwnershipTransferred is a free log retrieval operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) FilterOwnershipTransferred(opts *bind.FilterOpts, previousOwner []common.Address, newOwner []common.Address) (*NavEngineOwnershipTransferredIterator, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "OwnershipTransferred", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineOwnershipTransferredIterator{contract: _NavEngine.contract, event: "OwnershipTransferred", logs: logs, sub: sub}, nil
}

// WatchOwnershipTransferred is a free log subscription operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) WatchOwnershipTransferred(opts *bind.WatchOpts, sink chan<- *NavEngineOwnershipTransferred, previousOwner []common.Address, newOwner []common.Address) (event.Subscription, error) {

	var previousOwnerRule []interface{}
	for _, previousOwnerItem := range previousOwner {
		previousOwnerRule = append(previousOwnerRule, previousOwnerItem)
	}
	var newOwnerRule []interface{}
	for _, newOwnerItem := range newOwner {
		newOwnerRule = append(newOwnerRule, newOwnerItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "OwnershipTransferred", previousOwnerRule, newOwnerRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineOwnershipTransferred)
				if err := _NavEngine.contract.UnpackLog(event, "OwnershipTransferred", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseOwnershipTransferred is a log parse operation binding the contract event 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0.
//
// Solidity: event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
func (_NavEngine *NavEngineFilterer) ParseOwnershipTransferred(log types.Log) (*NavEngineOwnershipTransferred, error) {
	event := new(NavEngineOwnershipTransferred)
	if err := _NavEngine.contract.UnpackLog(event, "OwnershipTransferred", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEnginePausedIterator is returned from FilterPaused and is used to iterate over the raw logs and unpacked data for Paused events raised by the NavEngine contract.
type NavEnginePausedIterator struct {
	Event *NavEnginePaused // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEnginePausedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEnginePaused)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEnginePaused)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEnginePausedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEnginePausedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEnginePaused represents a Paused event raised by the NavEngine contract.
type NavEnginePaused struct {
	Account common.Address
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterPaused is a free log retrieval operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address account)
func (_NavEngine *NavEngineFilterer) FilterPaused(opts *bind.FilterOpts) (*NavEnginePausedIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "Paused")
	if err != nil {
		return nil, err
	}
	return &NavEnginePausedIterator{contract: _NavEngine.contract, event: "Paused", logs: logs, sub: sub}, nil
}

// WatchPaused is a free log subscription operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address account)
func (_NavEngine *NavEngineFilterer) WatchPaused(opts *bind.WatchOpts, sink chan<- *NavEnginePaused) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "Paused")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEnginePaused)
				if err := _NavEngine.contract.UnpackLog(event, "Paused", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParsePaused is a log parse operation binding the contract event 0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258.
//
// Solidity: event Paused(address account)
func (_NavEngine *NavEngineFilterer) ParsePaused(log types.Log) (*NavEnginePaused, error) {
	event := new(NavEnginePaused)
	if err := _NavEngine.contract.UnpackLog(event, "Paused", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineRateUpdatedIterator is returned from FilterRateUpdated and is used to iterate over the raw logs and unpacked data for RateUpdated events raised by the NavEngine contract.
type NavEngineRateUpdatedIterator struct {
	Event *NavEngineRateUpdated // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineRateUpdatedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineRateUpdated)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineRateUpdated)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineRateUpdatedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineRateUpdatedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineRateUpdated represents a RateUpdated event raised by the NavEngine contract.
type NavEngineRateUpdated struct {
	Rate        *big.Int
	TotalSupply *big.Int
	TotalTVL    *big.Int
	Timestamp   *big.Int
	Raw         types.Log // Blockchain specific contextual infos
}

// FilterRateUpdated is a free log retrieval operation binding the contract event 0xce568f0e96595181b7d4a837b062d1daf6c0a1ef743d9ada97f7b9153b34c5b2.
//
// Solidity: event RateUpdated(int192 indexed rate, uint256 totalSupply, uint256 totalTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) FilterRateUpdated(opts *bind.FilterOpts, rate []*big.Int, timestamp []*big.Int) (*NavEngineRateUpdatedIterator, error) {

	var rateRule []interface{}
	for _, rateItem := range rate {
		rateRule = append(rateRule, rateItem)
	}

	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "RateUpdated", rateRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineRateUpdatedIterator{contract: _NavEngine.contract, event: "RateUpdated", logs: logs, sub: sub}, nil
}

// WatchRateUpdated is a free log subscription operation binding the contract event 0xce568f0e96595181b7d4a837b062d1daf6c0a1ef743d9ada97f7b9153b34c5b2.
//
// Solidity: event RateUpdated(int192 indexed rate, uint256 totalSupply, uint256 totalTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) WatchRateUpdated(opts *bind.WatchOpts, sink chan<- *NavEngineRateUpdated, rate []*big.Int, timestamp []*big.Int) (event.Subscription, error) {

	var rateRule []interface{}
	for _, rateItem := range rate {
		rateRule = append(rateRule, rateItem)
	}

	var timestampRule []interface{}
	for _, timestampItem := range timestamp {
		timestampRule = append(timestampRule, timestampItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "RateUpdated", rateRule, timestampRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineRateUpdated)
				if err := _NavEngine.contract.UnpackLog(event, "RateUpdated", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseRateUpdated is a log parse operation binding the contract event 0xce568f0e96595181b7d4a837b062d1daf6c0a1ef743d9ada97f7b9153b34c5b2.
//
// Solidity: event RateUpdated(int192 indexed rate, uint256 totalSupply, uint256 totalTVL, uint256 indexed timestamp)
func (_NavEngine *NavEngineFilterer) ParseRateUpdated(log types.Log) (*NavEngineRateUpdated, error) {
	event := new(NavEngineRateUpdated)
	if err := _NavEngine.contract.UnpackLog(event, "RateUpdated", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineUnpausedIterator is returned from FilterUnpaused and is used to iterate over the raw logs and unpacked data for Unpaused events raised by the NavEngine contract.
type NavEngineUnpausedIterator struct {
	Event *NavEngineUnpaused // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineUnpausedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineUnpaused)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineUnpaused)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineUnpausedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineUnpausedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineUnpaused represents a Unpaused event raised by the NavEngine contract.
type NavEngineUnpaused struct {
	Account common.Address
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterUnpaused is a free log retrieval operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address account)
func (_NavEngine *NavEngineFilterer) FilterUnpaused(opts *bind.FilterOpts) (*NavEngineUnpausedIterator, error) {

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "Unpaused")
	if err != nil {
		return nil, err
	}
	return &NavEngineUnpausedIterator{contract: _NavEngine.contract, event: "Unpaused", logs: logs, sub: sub}, nil
}

// WatchUnpaused is a free log subscription operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address account)
func (_NavEngine *NavEngineFilterer) WatchUnpaused(opts *bind.WatchOpts, sink chan<- *NavEngineUnpaused) (event.Subscription, error) {

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "Unpaused")
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineUnpaused)
				if err := _NavEngine.contract.UnpackLog(event, "Unpaused", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseUnpaused is a log parse operation binding the contract event 0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa.
//
// Solidity: event Unpaused(address account)
func (_NavEngine *NavEngineFilterer) ParseUnpaused(log types.Log) (*NavEngineUnpaused, error) {
	event := new(NavEngineUnpaused)
	if err := _NavEngine.contract.UnpackLog(event, "Unpaused", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineUpdaterSetIterator is returned from FilterUpdaterSet and is used to iterate over the raw logs and unpacked data for UpdaterSet events raised by the NavEngine contract.
type NavEngineUpdaterSetIterator struct {
	Event *NavEngineUpdaterSet // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineUpdaterSetIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineUpdaterSet)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineUpdaterSet)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineUpdaterSetIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineUpdaterSetIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineUpdaterSet represents a UpdaterSet event raised by the NavEngine contract.
type NavEngineUpdaterSet struct {
	Updater common.Address
	Raw     types.Log // Blockchain specific contextual infos
}

// FilterUpdaterSet is a free log retrieval operation binding the contract event 0x5a39b8d3fd7361f3c5173afba233b7f1530567d03f9dfb0a2ca414960f08541d.
//
// Solidity: event UpdaterSet(address indexed updater)
func (_NavEngine *NavEngineFilterer) FilterUpdaterSet(opts *bind.FilterOpts, updater []common.Address) (*NavEngineUpdaterSetIterator, error) {

	var updaterRule []interface{}
	for _, updaterItem := range updater {
		updaterRule = append(updaterRule, updaterItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "UpdaterSet", updaterRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineUpdaterSetIterator{contract: _NavEngine.contract, event: "UpdaterSet", logs: logs, sub: sub}, nil
}

// WatchUpdaterSet is a free log subscription operation binding the contract event 0x5a39b8d3fd7361f3c5173afba233b7f1530567d03f9dfb0a2ca414960f08541d.
//
// Solidity: event UpdaterSet(address indexed updater)
func (_NavEngine *NavEngineFilterer) WatchUpdaterSet(opts *bind.WatchOpts, sink chan<- *NavEngineUpdaterSet, updater []common.Address) (event.Subscription, error) {

	var updaterRule []interface{}
	for _, updaterItem := range updater {
		updaterRule = append(updaterRule, updaterItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "UpdaterSet", updaterRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineUpdaterSet)
				if err := _NavEngine.contract.UnpackLog(event, "UpdaterSet", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseUpdaterSet is a log parse operation binding the contract event 0x5a39b8d3fd7361f3c5173afba233b7f1530567d03f9dfb0a2ca414960f08541d.
//
// Solidity: event UpdaterSet(address indexed updater)
func (_NavEngine *NavEngineFilterer) ParseUpdaterSet(log types.Log) (*NavEngineUpdaterSet, error) {
	event := new(NavEngineUpdaterSet)
	if err := _NavEngine.contract.UnpackLog(event, "UpdaterSet", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}

// NavEngineUpgradedIterator is returned from FilterUpgraded and is used to iterate over the raw logs and unpacked data for Upgraded events raised by the NavEngine contract.
type NavEngineUpgradedIterator struct {
	Event *NavEngineUpgraded // Event containing the contract specifics and raw log

	contract *bind.BoundContract // Generic contract to use for unpacking event data
	event    string              // Event name to use for unpacking event data

	logs chan types.Log        // Log channel receiving the found contract events
	sub  ethereum.Subscription // Subscription for errors, completion and termination
	done bool                  // Whether the subscription completed delivering logs
	fail error                 // Occurred error to stop iteration
}

// Next advances the iterator to the subsequent event, returning whether there
// are any more events found. In case of a retrieval or parsing error, false is
// returned and Error() can be queried for the exact failure.
func (it *NavEngineUpgradedIterator) Next() bool {
	// If the iterator failed, stop iterating
	if it.fail != nil {
		return false
	}
	// If the iterator completed, deliver directly whatever's available
	if it.done {
		select {
		case log := <-it.logs:
			it.Event = new(NavEngineUpgraded)
			if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
				it.fail = err
				return false
			}
			it.Event.Raw = log
			return true

		default:
			return false
		}
	}
	// Iterator still in progress, wait for either a data or an error event
	select {
	case log := <-it.logs:
		it.Event = new(NavEngineUpgraded)
		if err := it.contract.UnpackLog(it.Event, it.event, log); err != nil {
			it.fail = err
			return false
		}
		it.Event.Raw = log
		return true

	case err := <-it.sub.Err():
		it.done = true
		it.fail = err
		return it.Next()
	}
}

// Error returns any retrieval or parsing error occurred during filtering.
func (it *NavEngineUpgradedIterator) Error() error {
	return it.fail
}

// Close terminates the iteration process, releasing any pending underlying
// resources.
func (it *NavEngineUpgradedIterator) Close() error {
	it.sub.Unsubscribe()
	return nil
}

// NavEngineUpgraded represents a Upgraded event raised by the NavEngine contract.
type NavEngineUpgraded struct {
	Implementation common.Address
	Raw            types.Log // Blockchain specific contextual infos
}

// FilterUpgraded is a free log retrieval operation binding the contract event 0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b.
//
// Solidity: event Upgraded(address indexed implementation)
func (_NavEngine *NavEngineFilterer) FilterUpgraded(opts *bind.FilterOpts, implementation []common.Address) (*NavEngineUpgradedIterator, error) {

	var implementationRule []interface{}
	for _, implementationItem := range implementation {
		implementationRule = append(implementationRule, implementationItem)
	}

	logs, sub, err := _NavEngine.contract.FilterLogs(opts, "Upgraded", implementationRule)
	if err != nil {
		return nil, err
	}
	return &NavEngineUpgradedIterator{contract: _NavEngine.contract, event: "Upgraded", logs: logs, sub: sub}, nil
}

// WatchUpgraded is a free log subscription operation binding the contract event 0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b.
//
// Solidity: event Upgraded(address indexed implementation)
func (_NavEngine *NavEngineFilterer) WatchUpgraded(opts *bind.WatchOpts, sink chan<- *NavEngineUpgraded, implementation []common.Address) (event.Subscription, error) {

	var implementationRule []interface{}
	for _, implementationItem := range implementation {
		implementationRule = append(implementationRule, implementationItem)
	}

	logs, sub, err := _NavEngine.contract.WatchLogs(opts, "Upgraded", implementationRule)
	if err != nil {
		return nil, err
	}
	return event.NewSubscription(func(quit <-chan struct{}) error {
		defer sub.Unsubscribe()
		for {
			select {
			case log := <-logs:
				// New log arrived, parse the event and forward to the user
				event := new(NavEngineUpgraded)
				if err := _NavEngine.contract.UnpackLog(event, "Upgraded", log); err != nil {
					return err
				}
				event.Raw = log

				select {
				case sink <- event:
				case err := <-sub.Err():
					return err
				case <-quit:
					return nil
				}
			case err := <-sub.Err():
				return err
			case <-quit:
				return nil
			}
		}
	}), nil
}

// ParseUpgraded is a log parse operation binding the contract event 0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b.
//
// Solidity: event Upgraded(address indexed implementation)
func (_NavEngine *NavEngineFilterer) ParseUpgraded(log types.Log) (*NavEngineUpgraded, error) {
	event := new(NavEngineUpgraded)
	if err := _NavEngine.contract.UnpackLog(event, "Upgraded", log); err != nil {
		return nil, err
	}
	event.Raw = log
	return event, nil
}
